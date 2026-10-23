import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import rules from '../../../firestore.rules?raw'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const projectId = 'demo-peerly-collab'
let environment: RulesTestEnvironment

const hasEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST)

describe.skipIf(!hasEmulator)('scoreboard rules', () => {
  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId,
      firestore: { host: '127.0.0.1', port: 8180, rules },
    })
  })

  afterAll(async () => {
    await environment?.cleanup()
  })

  beforeEach(async () => {
    await environment?.clearFirestore()
  })

  it('allows signed-in users to read scoreboard entries but denies unauthenticated reads', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'scoreboard/weekly/entries/user-1'), {
        uid: 'user-1',
        displayName: 'Ada',
        points: 100,
        optIn: true,
      })
    })

    const anon = environment.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(anon, 'scoreboard/weekly/entries/user-1')))

    const user = environment.authenticatedContext('student-2').firestore()
    await assertSucceeds(getDoc(doc(user, 'scoreboard/weekly/entries/user-1')))
  })

  it('denies client writes (create, update, delete) to scoreboard entries', async () => {
    const user = environment.authenticatedContext('user-1').firestore()
    const entryRef = doc(user, 'scoreboard/weekly/entries/user-1')

    await assertFails(
      setDoc(entryRef, {
        uid: 'user-1',
        displayName: 'Hacker',
        points: 999999,
        optIn: true,
      }),
    )

    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'scoreboard/weekly/entries/user-1'), {
        uid: 'user-1',
        displayName: 'Ada',
        points: 100,
        optIn: true,
      })
    })

    await assertFails(updateDoc(entryRef, { points: 200 }))
    await assertFails(deleteDoc(entryRef))
  })

  it('denies all client reads and writes to userPointDailyLogs', async () => {
    const user = environment.authenticatedContext('user-1').firestore()
    const logRef = doc(user, 'userPointDailyLogs/user-1_2026-10-23')

    await assertFails(
      setDoc(logRef, {
        uid: 'user-1',
        date: '2026-10-23',
        total: 100,
      }),
    )

    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'userPointDailyLogs/user-1_2026-10-23'), {
        uid: 'user-1',
        date: '2026-10-23',
        total: 100,
      })
    })

    await assertFails(getDoc(logRef))
    await assertFails(updateDoc(logRef, { total: 200 }))
    await assertFails(deleteDoc(logRef))
  })
})
