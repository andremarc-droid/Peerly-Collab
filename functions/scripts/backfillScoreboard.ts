/**
 * Scoreboard Backfill Script.
 * Pages through users in chunks of 300, seeds missing weekly (0 pts) and allTime (stats.xp pts)
 * scoreboard entries for opted-in users.
 *
 * Usage:
 *   Dry-run (emulator):
 *     npx tsx functions/scripts/backfillScoreboard.ts
 *   Apply (emulator):
 *     npx tsx functions/scripts/backfillScoreboard.ts --apply
 *   Apply (production):
 *     npx tsx functions/scripts/backfillScoreboard.ts --apply --i-understand-this-is-production
 */

import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import {
  resolveAvatar,
  resolveDisplayName,
  resolveScoreboardOptIn,
  type ScoreboardUserFields,
} from '../src/scoreboardLogic.js'

const args = process.argv.slice(2)
const isApply = args.includes('--apply')
const isProductionApproved = args.includes('--i-understand-this-is-production')

const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_CONFIG || 'demo-peerly-collab'
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST

const isEmulator = Boolean(emulatorHost) || projectId === 'demo-peerly-collab'

if (!isEmulator && !isProductionApproved) {
  console.error(
    '\n[ERROR] Refusing to run against non-emulator project without explicit safety flag.' +
      '\nPass --i-understand-this-is-production to run against production.\n',
  )
  process.exit(1)
}

if (getApps().length === 0) {
  initializeApp({ projectId: typeof projectId === 'string' ? projectId : 'demo-peerly-collab' })
}

const db = getFirestore()

async function runBackfill() {
  console.log(`\n=== SCOREBOARD BACKFILL (${isApply ? 'APPLY MODE' : 'DRY RUN'}) ===`)
  console.log(`Target project: ${projectId} (Emulator: ${isEmulator ? 'YES' : 'NO'})`)

  const usersCol = db.collection('users')
  const CHUNK_SIZE = 300

  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null
  let totalUsers = 0
  let optedInUsers = 0
  let optedOutUsers = 0
  let missingWeeklyCount = 0
  let missingAllTimeCount = 0
  let deletedOptedOutEntries = 0

  while (true) {
    let q = usersCol.limit(CHUNK_SIZE)
    if (lastDoc) {
      q = q.startAfter(lastDoc)
    }
    const snap = await q.get()
    if (snap.empty) break

    const batch = isApply ? db.batch() : null
    let batchOperations = 0

    for (const userDoc of snap.docs) {
      totalUsers += 1
      const uid = userDoc.id
      const userData = userDoc.data() as ScoreboardUserFields
      const isOptedIn = resolveScoreboardOptIn(userData)

      const weeklyRef = db.doc(`scoreboard/weekly/entries/${uid}`)
      const allTimeRef = db.doc(`scoreboard/allTime/entries/${uid}`)

      const [weeklySnap, allTimeSnap] = await Promise.all([weeklyRef.get(), allTimeRef.get()])

      if (!isOptedIn) {
        optedOutUsers += 1
        if (weeklySnap.exists || allTimeSnap.exists) {
          deletedOptedOutEntries += 1
          if (batch) {
            if (weeklySnap.exists) batch.delete(weeklyRef)
            if (allTimeSnap.exists) batch.delete(allTimeRef)
            batchOperations += 2
          }
        }
      } else {
        optedInUsers += 1
        const displayName = resolveDisplayName(userData)
        const avatar = resolveAvatar(userData)
        const now = FieldValue.serverTimestamp()

        let userNeedsStats = !allTimeSnap.exists
        let statsXp = 0
        if (userNeedsStats) {
          const statsSnap = await db.doc(`users/${uid}/stats/summary`).get()
          statsXp = statsSnap.exists ? ((statsSnap.data()?.xp as number) ?? 0) : 0
        }

        if (!weeklySnap.exists) {
          missingWeeklyCount += 1
          if (batch) {
            batch.set(weeklyRef, {
              uid,
              displayName,
              avatar,
              points: 0,
              optIn: true,
              updatedAt: now,
            })
            batchOperations += 1
          }
        }

        if (!allTimeSnap.exists) {
          missingAllTimeCount += 1
          if (batch) {
            batch.set(allTimeRef, {
              uid,
              displayName,
              avatar,
              points: statsXp,
              optIn: true,
              updatedAt: now,
            })
            batchOperations += 1
          }
        }
      }
    }

    if (batch && batchOperations > 0) {
      await batch.commit()
    }

    if (snap.size < CHUNK_SIZE) break
    lastDoc = snap.docs[snap.docs.length - 1]!
  }

  console.log('\n--- BACKFILL SUMMARY ---')
  console.log(`Total users scanned:              ${totalUsers}`)
  console.log(`Opted-in users:                   ${optedInUsers}`)
  console.log(`Opted-out users:                  ${optedOutUsers}`)
  console.log(`Missing weekly entries created:   ${missingWeeklyCount} ${!isApply ? '(dry-run)' : ''}`)
  console.log(`Missing allTime entries created:  ${missingAllTimeCount} ${!isApply ? '(dry-run)' : ''}`)
  console.log(`Opted-out entries pruned:         ${deletedOptedOutEntries} ${!isApply ? '(dry-run)' : ''}`)
  console.log('========================\n')
}

runBackfill().catch((err) => {
  console.error('Backfill failed:', err)
  process.exit(1)
})
