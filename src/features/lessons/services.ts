import { collection, deleteDoc, doc, documentId, getCountFromServer, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch, type Firestore } from 'firebase/firestore'
import { firestore } from '../../lib/firebase/firestore'
import { parseLesson, parseLessonPlan, parseLessonProgress, MAX_PLANS } from './schemas'
import { emptyLessonProgress } from './progress'
import type { Lesson, LessonPlan, LessonPlanOutline, LessonProgressRecord, LessonRecord, LessonLevel, LessonPlanStatus } from './types'

export class LessonPlanLimitError extends Error { constructor() { super(`You can keep up to ${MAX_PLANS} lesson plans. Delete one to create another.`); this.name = 'LessonPlanLimitError' } }
const plansRef = (uid: string, db: Firestore) => collection(db, 'users', uid, 'lessonPlans')
const planRef = (uid: string, planId: string, db: Firestore) => doc(db, 'users', uid, 'lessonPlans', planId)
const lessonsRef = (uid: string, planId: string, db: Firestore) => collection(db, 'users', uid, 'lessonPlans', planId, 'lessons')
const progressRef = (uid: string, planId: string, db: Firestore) => doc(db, 'users', uid, 'lessonProgress', planId)
const srsRef = (uid: string, planId: string, lessonId: string, db: Firestore) => doc(db, 'users', uid, 'deckProgress', `lesson~${planId}~${lessonId}`)

export async function listLessonPlans(uid: string, db: Firestore = firestore): Promise<LessonPlan[]> {
  const snapshot = await getDocs(query(plansRef(uid, db), orderBy('updatedAt', 'desc'), limit(MAX_PLANS)))
  return snapshot.docs.flatMap(item => {
    try { return [parseLessonPlan(item.data(), item.id)] } catch { return [] }
  })
}

export async function createLessonPlan(uid: string, input: {
  outline: LessonPlanOutline; topic: string; level: LessonLevel; lessons: Record<string, Omit<LessonRecord, 'updatedAt'>>; status: LessonPlanStatus
}, db: Firestore = firestore): Promise<LessonPlan> {
  const count = await getCountFromServer(plansRef(uid, db))
  if (count.data().count >= MAX_PLANS) throw new LessonPlanLimitError()
  const ref = doc(plansRef(uid, db))
  const now = serverTimestamp()
  const planData = { title: input.outline.title, topic: input.topic.slice(0, 500), level: input.level, lessonCount: input.outline.lessons.length, order: input.outline.lessons.map(item => item.id), createdAt: now, updatedAt: now, status: input.status }
  const batch = writeBatch(db)
  batch.set(ref, planData)
  for (const [lessonId, lesson] of Object.entries(input.lessons)) {
    const parsed = parseLesson({ ...lesson, updatedAt: { toMillis: () => Date.now() } })
    const { updatedAt: _ignored, ...safeLesson } = parsed
    batch.set(doc(lessonsRef(uid, ref.id, db), lessonId), { ...safeLesson, updatedAt: now })
  }
  await batch.commit()
  const created = await getDoc(ref)
  return parseLessonPlan(created.data(), ref.id)
}

export async function getLessonPlan(uid: string, planId: string, db: Firestore = firestore): Promise<{ plan: LessonPlan; lessons: Record<string, Lesson> } | null> {
  const snapshot = await getDoc(planRef(uid, planId, db))
  if (!snapshot.exists()) return null
  const plan = parseLessonPlan(snapshot.data(), snapshot.id)
  const lessonsSnapshot = await getDocs(lessonsRef(uid, planId, db))
  const lessons: Record<string, Lesson> = {}
  for (const item of lessonsSnapshot.docs) {
    try { lessons[item.id] = parseLesson(item.data(), item.id) as Lesson } catch { /* One malformed lesson doesn't hide its plan. */ }
  }
  return { plan, lessons }
}

export async function saveLesson(uid: string, planId: string, lessonId: string, lesson: Omit<LessonRecord, 'updatedAt'>, db: Firestore = firestore): Promise<void> {
  const checked = parseLesson({ ...lesson, updatedAt: { toMillis: () => Date.now() } })
  const { updatedAt: _ignored, ...safeLesson } = checked
  await setDoc(doc(lessonsRef(uid, planId, db), lessonId), { ...safeLesson, updatedAt: serverTimestamp() })
  const plan = await getDoc(planRef(uid, planId, db))
  if (plan.exists()) {
    const metadata = parseLessonPlan(plan.data(), plan.id)
    const saved = await getDocs(lessonsRef(uid, planId, db))
    const ids = new Set(saved.docs.map(item => item.id))
    await updateDoc(plan.ref, { status: metadata.order.every(id => ids.has(id)) ? 'ready' : 'partial', updatedAt: serverTimestamp() })
  }
}

export async function renameLessonPlan(uid: string, planId: string, title: string, db: Firestore = firestore): Promise<void> {
  const next = title.trim()
  if (!next || next.length > 120) throw new Error('Plan title must be between 1 and 120 characters.')
  await updateDoc(planRef(uid, planId, db), { title: next, updatedAt: serverTimestamp() })
}

export async function reorderLessons(uid: string, planId: string, order: string[], db: Firestore = firestore): Promise<void> {
  const ref = planRef(uid, planId, db)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) throw new Error('This plan no longer exists.')
  const plan = parseLessonPlan(snapshot.data(), snapshot.id)
  if (order.length !== plan.order.length || new Set(order).size !== order.length || order.some(id => !plan.order.includes(id))) throw new Error('Lesson order must contain every lesson exactly once.')
  await updateDoc(ref, { order, updatedAt: serverTimestamp() })
}

export async function deleteLesson(uid: string, planId: string, lessonId: string, db: Firestore = firestore): Promise<void> {
  const ref = planRef(uid, planId, db)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return
  const plan = parseLessonPlan(snapshot.data(), snapshot.id)
  if (!plan.order.includes(lessonId)) return
  const order = plan.order.filter(id => id !== lessonId)
  if (!order.length) { await deletePlan(uid, planId, db); return }
  const batch = writeBatch(db)
  batch.delete(doc(lessonsRef(uid, planId, db), lessonId))
  batch.delete(srsRef(uid, planId, lessonId, db))
  batch.update(ref, { order, lessonCount: order.length, updatedAt: serverTimestamp() })
  const progress = await getDoc(progressRef(uid, planId, db))
  if (progress.exists()) {
    const current = parseLessonProgress(progress.data())
    const lessons = { ...current.lessons }; delete lessons[lessonId]
    batch.set(progressRef(uid, planId, db), { ...current, lessons, lastLessonId: current.lastLessonId === lessonId ? order[0] : current.lastLessonId, updatedAt: serverTimestamp() })
  }
  await batch.commit()
}

export async function deletePlan(uid: string, planId: string, db: Firestore = firestore): Promise<void> {
  const lessons = await getDocs(query(lessonsRef(uid, planId, db), limit(450)))
  for (let start = 0; start < lessons.docs.length; start += 400) {
    const batch = writeBatch(db)
    lessons.docs.slice(start, start + 400).forEach(lesson => batch.delete(lesson.ref))
    await batch.commit()
  }
  const srs = await getDocs(query(collection(db, 'users', uid, 'deckProgress'), where(documentId(), '>=', `lesson~${planId}~`), where(documentId(), '<', `lesson~${planId}~\uf8ff`)))
  for (let start = 0; start < srs.docs.length; start += 400) {
    const batch = writeBatch(db)
    srs.docs.slice(start, start + 400).forEach(item => batch.delete(item.ref))
    await batch.commit()
  }
  await deleteDoc(progressRef(uid, planId, db))
  await deleteDoc(planRef(uid, planId, db))
}

export async function loadLessonProgress(uid: string, planId: string, db: Firestore = firestore): Promise<LessonProgressRecord> {
  const snapshot = await getDoc(progressRef(uid, planId, db))
  return snapshot.exists() ? parseLessonProgress(snapshot.data()) : emptyLessonProgress({ toMillis: () => Date.now() })
}
export async function saveLessonProgress(uid: string, planId: string, progress: LessonProgressRecord, db: Firestore = firestore): Promise<void> {
  const checked = parseLessonProgress({ ...progress, updatedAt: { toMillis: () => progress.updatedAt.toMillis() } })
  await setDoc(progressRef(uid, planId, db), { ...checked, updatedAt: serverTimestamp() })
}
