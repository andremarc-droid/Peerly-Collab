import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import rules from '../../../firestore.rules?raw'
import { afterAll, beforeAll, describe, it } from 'vitest'

let environment: RulesTestEnvironment
beforeAll(async () => {
  environment = await initializeTestEnvironment({ projectId: 'demo-peerly-collab', firestore: { host: '127.0.0.1', port: Number(process.env.PEERLY_FIRESTORE_TEST_PORT ?? 8180), rules } })
})
afterAll(async () => environment.cleanup())

describe('YouTube transcript quota rules', () => {
  it('denies clients reading or writing callable-only quota counters', async () => {
    const db = environment.authenticatedContext('student').firestore()
    const ref = doc(db, 'youtubeTranscriptRateLimits/student')
    await assertFails(getDoc(ref))
    await assertFails(setDoc(ref, { count: 1, windowStartedAt: new Date() }))
  })
})
