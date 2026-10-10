import { doc, getDoc, onSnapshot, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore'
import { firestore } from '../../lib/firebase/firestore'
import { localDayKey, advanceStreak, type StreakState } from './streak'
import { emptyStats, parseStats, type DailyGoalXp, type StatsSummary } from './schemas'
import { XP_AWARDS } from './xp'

export type ActivityKind = 'review' | 'lessonCompleted' | 'quizFinished'
export interface ActivityInput { kind: ActivityKind; amount: number; key?: string }
interface QueuedActivity { uid: string; activity: ActivityInput; nextChunk: number; chunkCount: number; db: Firestore }
const pending = new Map<string, QueuedActivity>()
const inFlight = new Map<string, Promise<boolean>>()
const completed = new Set<string>()
let actionSequence = 0
const statsRef = (uid: string, db: Firestore) => doc(db, 'users', uid, 'stats', 'summary')
const queueKey = (uid: string, key: string) => `${uid}:${key}`

function validateActivity(activity: ActivityInput): void {
  if (!Number.isSafeInteger(activity.amount) || activity.amount < 0) throw new Error('Activity XP must be a non-negative integer.')
  if (activity.kind === 'review' && activity.amount > 3) throw new Error('A card review can award at most 3 XP.')
  if (activity.kind === 'lessonCompleted' && activity.amount !== XP_AWARDS.lessonCompleted) throw new Error('Lesson completion awards 20 XP.')
  if (activity.kind === 'quizFinished' && activity.amount > 55) throw new Error('A quiz can award at most 55 XP.')
  if (activity.kind === 'lessonCompleted' && !lessonProgressPath(activity.key ?? '')) throw new Error('Lesson activity needs a plan and lesson key.')
  if (activity.key && activity.key.length > 300) throw new Error('Activity key is too long.')
}

function lessonProgressPath(key: string): { planId: string; lessonId: string } | null {
  const match = /^lesson:([A-Za-z0-9_-]{1,128}):([A-Za-z0-9_-]{1,128})$/.exec(key)
  return match ? { planId: match[1]!, lessonId: match[2]! } : null
}

export async function loadStats(uid: string, db: Firestore = firestore, now = new Date()): Promise<StatsSummary> {
  const snapshot = await getDoc(statsRef(uid, db))
  const today = localDayKey(now)
  return snapshot.exists() ? parseStats(snapshot.data(), today) : emptyStats(today)
}

export function watchStats(uid: string, onChange: (stats: StatsSummary) => void, onError: (error: Error) => void, db: Firestore = firestore): () => void {
  return onSnapshot(statsRef(uid, db), snapshot => {
    const today = localDayKey(new Date())
    onChange(snapshot.exists() ? parseStats(snapshot.data(), today) : emptyStats(today))
    void retryPendingActivity(uid)
  }, cause => onError(cause instanceof Error ? cause : new Error('Could not load your study stats.')))
}

export async function setDailyGoalXp(uid: string, goal: DailyGoalXp, db: Firestore = firestore, now = new Date()): Promise<void> {
  if (!XP_AWARDS.dailyGoals.includes(goal)) throw new Error('Choose a daily goal of 10, 20, 50, or 100 XP.')
  const today = localDayKey(now)
  const ref = statsRef(uid, db)
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref)
    const stats = snapshot.exists() ? parseStats(snapshot.data(), today) : emptyStats(today)
    transaction.set(ref, { ...stats, dailyGoalXp: goal, updatedAt: serverTimestamp() })
  })
}

async function writeActivityChunk(item: QueuedActivity, chunk: number): Promise<boolean> {
  const { uid, activity, db } = item
  const today = localDayKey(new Date())
  const ref = statsRef(uid, db)
  const lesson = activity.kind === 'lessonCompleted' ? lessonProgressPath(activity.key ?? '') : null
  const lessonRef = lesson ? doc(db, 'users', uid, 'lessonProgress', lesson.planId) : null
  return runTransaction(db, async transaction => {
    const summarySnapshot = await transaction.get(ref)
    const lessonSnapshot = lessonRef ? await transaction.get(lessonRef) : null
    if (lessonSnapshot && lessonSnapshot.exists()) {
      const raw = lessonSnapshot.data()
      const records = raw.lessons as Record<string, Record<string, unknown>> | undefined
      const record = records?.[lesson!.lessonId]
      if (!record || record.step !== 'done') throw new Error('Complete this lesson before awarding completion XP.')
      if (record.xpAwarded === true) return true
    } else if (lessonRef) throw new Error('Lesson progress is missing; completion XP was not recorded.')

    const current = summarySnapshot.exists() ? parseStats(summarySnapshot.data(), today) : emptyStats(today)
    const streak = advanceStreak(current as StreakState, today)
    const oldTodayXp = current.today.day === today ? current.today.xp : 0
    const requestedXp = chunk === 0 ? 0 : Math.min(XP_AWARDS.maxPerWrite, chunk)
    const awardedXp = Math.min(requestedXp, XP_AWARDS.maxPerDay - oldTodayXp)
    const next = {
      ...current,
      xp: current.xp + awardedXp,
      totalReviews: current.totalReviews + (activity.kind === 'review' && item.nextChunk === 0 ? 1 : 0),
      ...streak,
      today: { day: today, xp: oldTodayXp + awardedXp },
      updatedAt: serverTimestamp(),
    }
    if (lessonRef && lesson && lessonSnapshot) {
      const raw = lessonSnapshot.data()
      if (!raw) throw new Error('Lesson progress is unavailable; completion XP was not recorded.')
      const records = raw.lessons as Record<string, Record<string, unknown>>
      transaction.update(lessonRef, { lessons: { ...records, [lesson.lessonId]: { ...records[lesson.lessonId], xpAwarded: true } }, updatedAt: serverTimestamp() })
    }
    transaction.set(ref, next)
    return true
  })
}

async function flushOne(key: string, item: QueuedActivity): Promise<boolean> {
  const existing = inFlight.get(key)
  if (existing) return existing
  const task = (async () => {
    try {
      while (item.nextChunk < item.chunkCount) {
        const remaining = item.activity.amount - item.nextChunk * XP_AWARDS.maxPerWrite
        const amount = Math.max(0, Math.min(XP_AWARDS.maxPerWrite, remaining))
        const wasAwarded = await writeActivityChunk(item, amount)
        item.nextChunk += 1
        if (!wasAwarded || item.activity.kind === 'lessonCompleted') break
      }
      if (item.nextChunk >= item.chunkCount || item.activity.kind === 'lessonCompleted') {
        pending.delete(key)
        completed.add(key)
        if (completed.size > 1000) completed.delete(completed.values().next().value as string)
        return true
      }
      return false
    } catch (cause) {
      console.warn('Study activity is queued for a later retry.', cause)
      return false
    } finally { inFlight.delete(key) }
  })()
  inFlight.set(key, task)
  return task
}

/** Stats failures are queued in memory and never need to interrupt a study action. */
export async function recordActivity(uid: string, activity: ActivityInput, db: Firestore = firestore): Promise<boolean> {
  validateActivity(activity)
  const key = activity.key ?? `activity-${Date.now()}-${++actionSequence}`
  const id = queueKey(uid, key)
  if (completed.has(id)) return true
  const item = pending.get(id) ?? { uid, activity: { ...activity, key }, nextChunk: 0, chunkCount: Math.max(1, Math.ceil(activity.amount / XP_AWARDS.maxPerWrite)), db }
  pending.set(id, item)
  return flushOne(id, item)
}

export async function retryPendingActivity(uid?: string): Promise<void> {
  await Promise.all([...pending.entries()].filter(([, item]) => uid === undefined || item.uid === uid).map(([key, item]) => flushOne(key, item)))
}

if (typeof window !== 'undefined') window.addEventListener('online', () => { void retryPendingActivity() })
