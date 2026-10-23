import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'

export type StudyEventType = 'card_mastered' | 'practice_completed' | 'quiz_completed'

export interface RecordStudyEventData {
  eventType: StudyEventType
  count?: number
}

export interface UpdateScoreboardOptInData {
  optIn: boolean
  displayName?: string
}

export const POINT_VALUES: Record<StudyEventType, number> = {
  card_mastered: 5,
  practice_completed: 25,
  quiz_completed: 50,
}

export const DAILY_CAPS: Record<StudyEventType, number> = {
  card_mastered: 100,
  practice_completed: 50,
  quiz_completed: 100,
}

export const TOTAL_DAILY_CAP = 250

export function getTodayKeyUtc(date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

export async function recordStudyEventHandler(
  request: CallableRequest<RecordStudyEventData>,
): Promise<{ awardedPoints: number; totalDailyPoints: number }> {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to record study points.')
  }

  const uid = request.auth.uid
  const { eventType, count = 1 } = request.data || {}
  if (!eventType || !(eventType in POINT_VALUES)) {
    throw new HttpsError('invalid-argument', 'Valid study eventType is required.')
  }

  const db = getFirestore()
  const todayKey = getTodayKeyUtc()
  const logRef = db.doc(`userPointDailyLogs/${uid}_${todayKey}`)
  const userRef = db.doc(`users/${uid}`)
  const weeklyEntryRef = db.doc(`scoreboard/weekly/entries/${uid}`)
  const allTimeEntryRef = db.doc(`scoreboard/allTime/entries/${uid}`)

  const result = await db.runTransaction(async (transaction) => {
    const logSnap = await transaction.get(logRef)
    const currentLog = logSnap.data() || {
      total: 0,
      card_mastered: 0,
      practice_completed: 0,
      quiz_completed: 0,
    }

    const currentTypePoints = (currentLog[eventType] as number) ?? 0
    const currentTotal = (currentLog.total as number) ?? 0

    if (currentTotal >= TOTAL_DAILY_CAP) {
      return { awardedPoints: 0, totalDailyPoints: currentTotal }
    }

    const typeCap = DAILY_CAPS[eventType]
    const unitPoints = POINT_VALUES[eventType]
    const potentialPoints = unitPoints * Math.max(1, Math.min(count, 20))
    const typeRemaining = Math.max(0, typeCap - currentTypePoints)
    const totalRemaining = Math.max(0, TOTAL_DAILY_CAP - currentTotal)

    const pointsToAward = Math.min(potentialPoints, typeRemaining, totalRemaining)
    if (pointsToAward <= 0) {
      return { awardedPoints: 0, totalDailyPoints: currentTotal }
    }

    const newTotal = currentTotal + pointsToAward
    const newTypePoints = currentTypePoints + pointsToAward

    transaction.set(
      logRef,
      {
        uid,
        date: todayKey,
        total: newTotal,
        [eventType]: newTypePoints,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    const userSnap = await transaction.get(userRef)
    const userData = userSnap.data() || {}
    const isStudent = userData.role === 'student'
    const age = typeof userData.age === 'number' ? userData.age : null
    const isUnder18 = isStudent && age !== null && age < 18
    const optIn = userData.scoreboardOptIn ?? (isUnder18 ? false : true)
    const displayName =
      userData.scoreboardDisplayName ||
      userData.displayName ||
      userData.name ||
      'Peerly Learner'
    const avatar = userData.avatar || userData.photoURL || null

    if (optIn) {
      const now = FieldValue.serverTimestamp()
      transaction.set(
        weeklyEntryRef,
        {
          uid,
          displayName,
          avatar,
          points: FieldValue.increment(pointsToAward),
          optIn: true,
          updatedAt: now,
        },
        { merge: true },
      )

      transaction.set(
        allTimeEntryRef,
        {
          uid,
          displayName,
          avatar,
          points: FieldValue.increment(pointsToAward),
          optIn: true,
          updatedAt: now,
        },
        { merge: true },
      )
    }

    return { awardedPoints: pointsToAward, totalDailyPoints: newTotal }
  })

  return result
}

export async function updateScoreboardOptInHandler(
  request: CallableRequest<UpdateScoreboardOptInData>,
): Promise<{ success: boolean; optIn: boolean }> {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.')
  }

  const uid = request.auth.uid
  const { optIn, displayName } = request.data || {}
  const db = getFirestore()

  const userRef = db.doc(`users/${uid}`)
  const weeklyEntryRef = db.doc(`scoreboard/weekly/entries/${uid}`)
  const allTimeEntryRef = db.doc(`scoreboard/allTime/entries/${uid}`)

  await db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef)
    const userData = userSnap.data() || {}
    const cleanName = (displayName ?? userData.scoreboardDisplayName ?? userData.displayName ?? 'Learner')
      .trim()
      .slice(0, 40)

    transaction.set(
      userRef,
      {
        scoreboardOptIn: optIn,
        scoreboardDisplayName: cleanName,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    if (!optIn) {
      transaction.delete(weeklyEntryRef)
      transaction.delete(allTimeEntryRef)
    } else {
      const weeklySnap = await transaction.get(weeklyEntryRef)
      const allTimeSnap = await transaction.get(allTimeEntryRef)
      const now = FieldValue.serverTimestamp()

      transaction.set(
        weeklyEntryRef,
        {
          uid,
          displayName: cleanName,
          avatar: userData.avatar || null,
          points: weeklySnap.exists ? weeklySnap.data()?.points ?? 0 : 0,
          optIn: true,
          updatedAt: now,
        },
        { merge: true },
      )

      transaction.set(
        allTimeEntryRef,
        {
          uid,
          displayName: cleanName,
          avatar: userData.avatar || null,
          points: allTimeSnap.exists ? allTimeSnap.data()?.points ?? 0 : 0,
          optIn: true,
          updatedAt: now,
        },
        { merge: true },
      )
    }
  })

  return { success: true, optIn }
}

export async function resetWeeklyScoreboardHandler(): Promise<{ deletedCount: number }> {
  const db = getFirestore()
  const snap = await db.collection('scoreboard/weekly/entries').get()
  if (snap.empty) return { deletedCount: 0 }

  const batch = db.batch()
  snap.docs.forEach((docSnap) => batch.delete(docSnap.ref))
  await batch.commit()
  return { deletedCount: snap.size }
}
