import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import type { Change, FirestoreEvent } from 'firebase-functions/v2/firestore'
import type { DocumentSnapshot } from 'firebase-admin/firestore'
import {
  calculateCappedDelta,
  DAILY_SCOREBOARD_CAP,
  getTodayKeyUtc,
  resolveAvatar,
  resolveDisplayName,
  resolveScoreboardOptIn,
  validateScoreboardDisplayName,
  type ScoreboardUserFields,
} from './scoreboardLogic.js'

export interface UpdateScoreboardOptInData {
  optIn: boolean
  displayName?: string
}

/**
 * Triggered whenever a user's stats summary document is written.
 * When `xp` increases, awards the capped delta to weekly and allTime scoreboard
 * entries if the user is currently opted in.
 */
export async function syncStatsSummaryToScoreboardHandler(
  event: FirestoreEvent<Change<DocumentSnapshot> | undefined, { uid: string }>,
): Promise<{ awardedPoints: number; totalDailyPoints: number } | null> {
  if (!event.data) return null

  const uid = event.params.uid
  const beforeData = event.data.before?.exists ? event.data.before.data() : null
  const afterData = event.data.after?.exists ? event.data.after.data() : null

  if (!afterData) return null // Stats doc deleted

  const oldXp = (beforeData?.xp as number) ?? 0
  const newXp = (afterData.xp as number) ?? 0
  const delta = newXp - oldXp

  if (delta <= 0) {
    return { awardedPoints: 0, totalDailyPoints: 0 }
  }

  const db = getFirestore()
  const todayKey = getTodayKeyUtc()
  const logRef = db.doc(`userPointDailyLogs/${uid}_${todayKey}`)
  const userRef = db.doc(`users/${uid}`)
  const weeklyEntryRef = db.doc(`scoreboard/weekly/entries/${uid}`)
  const allTimeEntryRef = db.doc(`scoreboard/allTime/entries/${uid}`)

  return await db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef)
    const userData = (userSnap.data() as ScoreboardUserFields) || {}
    const isOptedIn = resolveScoreboardOptIn(userData)

    if (!isOptedIn) {
      return { awardedPoints: 0, totalDailyPoints: 0 }
    }

    const logSnap = await transaction.get(logRef)
    const currentDailyTotal = logSnap.exists ? ((logSnap.data()?.total as number) ?? 0) : 0
    const pointsToAward = calculateCappedDelta(currentDailyTotal, delta, DAILY_SCOREBOARD_CAP)

    if (pointsToAward <= 0) {
      return { awardedPoints: 0, totalDailyPoints: currentDailyTotal }
    }

    const newDailyTotal = currentDailyTotal + pointsToAward
    const now = FieldValue.serverTimestamp()

    transaction.set(
      logRef,
      {
        uid,
        date: todayKey,
        total: newDailyTotal,
        updatedAt: now,
      },
      { merge: true },
    )

    const displayName = resolveDisplayName(userData)
    const avatar = resolveAvatar(userData)

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

    return { awardedPoints: pointsToAward, totalDailyPoints: newDailyTotal }
  })
}

/**
 * Idempotent callable ensuring the caller has weekly and allTime scoreboard entries
 * if opted in. Never overwrites existing points.
 */
export async function ensureScoreboardEntryHandler(
  request: CallableRequest<void>,
): Promise<{ optIn: boolean; created: boolean }> {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.')
  }

  const uid = request.auth.uid
  const db = getFirestore()
  const userRef = db.doc(`users/${uid}`)
  const weeklyRef = db.doc(`scoreboard/weekly/entries/${uid}`)
  const allTimeRef = db.doc(`scoreboard/allTime/entries/${uid}`)

  const userSnap = await userRef.get()
  const userData = (userSnap.data() as ScoreboardUserFields) || {}
  const optIn = resolveScoreboardOptIn(userData)

  if (!optIn) {
    await Promise.all([weeklyRef.delete().catch(() => {}), allTimeRef.delete().catch(() => {})])
    return { optIn: false, created: false }
  }

  const [weeklySnap, allTimeSnap, statsSnap] = await Promise.all([
    weeklyRef.get(),
    allTimeRef.get(),
    db.doc(`users/${uid}/stats/summary`).get(),
  ])

  const displayName = resolveDisplayName(userData)
  const avatar = resolveAvatar(userData)
  const now = FieldValue.serverTimestamp()
  const statsXp = statsSnap.exists ? ((statsSnap.data()?.xp as number) ?? 0) : 0

  const batch = db.batch()
  let created = false

  if (!weeklySnap.exists) {
    batch.set(weeklyRef, {
      uid,
      displayName,
      avatar,
      points: 0,
      optIn: true,
      updatedAt: now,
    })
    created = true
  } else {
    batch.set(
      weeklyRef,
      {
        displayName,
        avatar,
        optIn: true,
        updatedAt: now,
      },
      { merge: true },
    )
  }

  if (!allTimeSnap.exists) {
    batch.set(allTimeRef, {
      uid,
      displayName,
      avatar,
      points: statsXp,
      optIn: true,
      updatedAt: now,
    })
    created = true
  } else {
    batch.set(
      allTimeRef,
      {
        displayName,
        avatar,
        optIn: true,
        updatedAt: now,
      },
      { merge: true },
    )
  }

  await batch.commit()
  return { optIn: true, created }
}

/**
 * Triggered on user profile document changes to keep display fields and opt-in status in sync.
 */
export async function syncUserToScoreboardHandler(
  event: FirestoreEvent<Change<DocumentSnapshot> | undefined, { userId: string }>,
): Promise<void> {
  if (!event.data) return
  const userId = event.params.userId
  const db = getFirestore()

  if (!event.data.after.exists) {
    const weeklyRef = db.doc(`scoreboard/weekly/entries/${userId}`)
    const allTimeRef = db.doc(`scoreboard/allTime/entries/${userId}`)
    await Promise.all([weeklyRef.delete().catch(() => {}), allTimeRef.delete().catch(() => {})])
    return
  }

  const beforeData = (event.data.before.exists ? event.data.before.data() : null) as ScoreboardUserFields | null
  const afterData = event.data.after.data() as ScoreboardUserFields

  if (beforeData) {
    const relevantKeys: (keyof ScoreboardUserFields)[] = [
      'role',
      'age',
      'scoreboardOptIn',
      'scoreboardDisplayName',
      'displayName',
      'name',
      'avatar',
      'photoURL',
    ]
    const changed = relevantKeys.some((k) => beforeData[k] !== afterData[k])
    if (!changed) return
  }

  const weeklyRef = db.doc(`scoreboard/weekly/entries/${userId}`)
  const allTimeRef = db.doc(`scoreboard/allTime/entries/${userId}`)

  const optIn = resolveScoreboardOptIn(afterData)
  if (!optIn) {
    await Promise.all([weeklyRef.delete().catch(() => {}), allTimeRef.delete().catch(() => {})])
    return
  }

  const displayName = resolveDisplayName(afterData)
  const avatar = resolveAvatar(afterData)
  const now = FieldValue.serverTimestamp()

  const [weeklySnap, allTimeSnap, statsSnap] = await Promise.all([
    weeklyRef.get(),
    allTimeRef.get(),
    db.doc(`users/${userId}/stats/summary`).get(),
  ])

  const statsXp = statsSnap.exists ? ((statsSnap.data()?.xp as number) ?? 0) : 0
  const batch = db.batch()

  if (!weeklySnap.exists) {
    batch.set(weeklyRef, {
      uid: userId,
      displayName,
      avatar,
      points: 0,
      optIn: true,
      updatedAt: now,
    })
  } else {
    batch.set(weeklyRef, { displayName, avatar, optIn: true, updatedAt: now }, { merge: true })
  }

  if (!allTimeSnap.exists) {
    batch.set(allTimeRef, {
      uid: userId,
      displayName,
      avatar,
      points: statsXp,
      optIn: true,
      updatedAt: now,
    })
  } else {
    batch.set(allTimeRef, { displayName, avatar, optIn: true, updatedAt: now }, { merge: true })
  }

  await batch.commit()
}

/**
 * Callable allowing user to update their opt-in preference and custom scoreboard display name.
 */
export async function updateScoreboardOptInHandler(
  request: CallableRequest<UpdateScoreboardOptInData>,
): Promise<{ success: boolean; optIn: boolean }> {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.')
  }

  const uid = request.auth.uid
  const data = request.data
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'Request body must be an object.')
  }
  const { optIn, displayName } = data
  if (typeof optIn !== 'boolean') {
    throw new HttpsError('invalid-argument', 'optIn must be a boolean.')
  }
  if (displayName !== undefined && displayName !== null && typeof displayName !== 'string') {
    throw new HttpsError('invalid-argument', 'displayName must be a string or undefined.')
  }

  const trimmedName = typeof displayName === 'string' ? displayName.trim() : null
  if (trimmedName) {
    const nameCheck = validateScoreboardDisplayName(trimmedName)
    if (!nameCheck.valid) {
      throw new HttpsError('invalid-argument', nameCheck.error || 'Invalid display name.')
    }
  }

  const db = getFirestore()
  const userRef = db.doc(`users/${uid}`)
  const weeklyEntryRef = db.doc(`scoreboard/weekly/entries/${uid}`)
  const allTimeEntryRef = db.doc(`scoreboard/allTime/entries/${uid}`)
  const statsRef = db.doc(`users/${uid}/stats/summary`)

  await db.runTransaction(async (transaction) => {
    // 1. ALL READS FIRST
    const [userSnap, weeklySnap, allTimeSnap, statsSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(weeklyEntryRef),
      transaction.get(allTimeEntryRef),
      transaction.get(statsRef),
    ])

    const userData = (userSnap.data() as ScoreboardUserFields) || {}
    const statsXp = statsSnap.exists ? ((statsSnap.data()?.xp as number) ?? 0) : 0
    const now = FieldValue.serverTimestamp()

    // Determine clean display name (2-30 characters per schema)
    const rawClean = trimmedName ?? userData.scoreboardDisplayName ?? userData.displayName ?? userData.name ?? 'Peerly Learner'
    const cleanName = (rawClean.trim().slice(0, 30) || 'Peerly Learner')
    const avatar = userData.avatar || userData.photoURL || null

    // 2. ALL WRITES AFTER READS
    const userUpdate: Record<string, unknown> = {
      scoreboardOptIn: optIn,
      updatedAt: now,
    }
    if (trimmedName !== null) {
      userUpdate.scoreboardDisplayName = cleanName
    }
    transaction.set(userRef, userUpdate, { merge: true })

    if (!optIn) {
      transaction.delete(weeklyEntryRef)
      transaction.delete(allTimeEntryRef)
    } else {
      const weeklyPoints = weeklySnap.exists ? ((weeklySnap.data()?.points as number) ?? 0) : 0
      const allTimePoints = allTimeSnap.exists ? ((allTimeSnap.data()?.points as number) ?? 0) : statsXp

      transaction.set(
        weeklyEntryRef,
        {
          uid,
          displayName: cleanName,
          avatar,
          points: weeklyPoints,
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
          avatar,
          points: allTimePoints,
          optIn: true,
          updatedAt: now,
        },
        { merge: true },
      )
    }
  })

  return { success: true, optIn }
}

/**
 * Scheduled job to reset weekly scoreboard entries to 0 without deleting opted-in users.
 * Pages in batches of 400. Deletes entries for users who are now opted out.
 */
export async function resetWeeklyScoreboardHandler(): Promise<{
  processedCount: number
  resetCount: number
  deletedCount: number
}> {
  const db = getFirestore()
  const entriesCol = db.collection('scoreboard/weekly/entries')
  const BATCH_SIZE = 400

  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null
  let processedCount = 0
  let resetCount = 0
  let deletedCount = 0

  while (true) {
    let q = entriesCol.limit(BATCH_SIZE)
    if (lastDoc) {
      q = q.startAfter(lastDoc)
    }
    const snap = await q.get()
    if (snap.empty) break

    const batch = db.batch()
    const userDocs = await Promise.all(snap.docs.map((d) => db.doc(`users/${d.id}`).get()))

    for (let i = 0; i < snap.docs.length; i++) {
      const entryDoc = snap.docs[i]!
      const userDoc = userDocs[i]!
      const userData = (userDoc.exists ? userDoc.data() : null) as ScoreboardUserFields | null
      const isOptedIn = resolveScoreboardOptIn(userData)

      if (!isOptedIn) {
        batch.delete(entryDoc.ref)
        batch.delete(db.doc(`scoreboard/allTime/entries/${entryDoc.id}`))
        deletedCount += 1
      } else {
        batch.update(entryDoc.ref, {
          points: 0,
          updatedAt: FieldValue.serverTimestamp(),
        })
        resetCount += 1
      }
      processedCount += 1
    }

    await batch.commit()
    if (snap.size < BATCH_SIZE) break
    lastDoc = snap.docs[snap.docs.length - 1]!
  }

  return { processedCount, resetCount, deletedCount }
}
