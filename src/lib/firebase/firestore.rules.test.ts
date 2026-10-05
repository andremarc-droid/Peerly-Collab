import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import rules from '../../../firestore.rules?raw'

const projectId = 'demo-peerly-collab'
let testEnvironment: RulesTestEnvironment

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: 8180, rules },
  })
})

afterEach(async () => {
  await testEnvironment.clearFirestore()
})

afterAll(async () => {
  await testEnvironment.cleanup()
})

function userData(uid: string, role: 'student' | 'instructor' | null = null) {
  return { uid, name: 'Learner', email: `${uid}@example.test`, photoURL: null, role, createdAt: 1, updatedAt: 1 }
}

function userDataWithoutRole(uid: string) {
  return Object.fromEntries(Object.entries(userData(uid)).filter(([field]) => field !== 'role'))
}

describe('Firestore security rules', () => {
  it('denies signed-out user document reads and writes', async () => {
    const reference = doc(testEnvironment.unauthenticatedContext().firestore(), 'users/alex')
    await assertFails(getDoc(reference))
    await assertFails(setDoc(reference, userData('alex')))
  })

  it('allows a user to read, create, and update their own document', async () => {
    const reference = doc(testEnvironment.authenticatedContext('alex').firestore(), 'users/alex')
    await assertSucceeds(setDoc(reference, userDataWithoutRole('alex')))
    await assertSucceeds(getDoc(reference))
    await assertSucceeds(updateDoc(reference, { name: 'Alex Learner', updatedAt: 2 }))
  })

  it('denies reading or writing another user document', async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/other'), userData('other'))
    })
    const reference = doc(testEnvironment.authenticatedContext('alex').firestore(), 'users/other')
    await assertFails(getDoc(reference))
    await assertFails(updateDoc(reference, { name: 'Changed' }))
  })

  it('allows a null role to be set once and then prevents changing or removing it', async () => {
    const reference = doc(testEnvironment.authenticatedContext('alex').firestore(), 'users/alex')
    await assertSucceeds(setDoc(reference, userData('alex')))
    await assertSucceeds(updateDoc(reference, { role: 'instructor' }))
    await assertSucceeds(updateDoc(reference, { name: 'Alex' }))
    await assertFails(updateDoc(reference, { role: 'student' }))
    await assertFails(updateDoc(reference, { role: null }))
    await assertFails(updateDoc(reference, { role: 'invalid' }))
  })

  it('rejects invalid roles on create and when filling an empty role', async () => {
    const reference = doc(testEnvironment.authenticatedContext('alex').firestore(), 'users/alex')
    await assertFails(setDoc(reference, { ...userData('alex'), role: 'admin' }))
    await assertSucceeds(setDoc(reference, userData('alex')))
    await assertFails(updateDoc(reference, { role: 'admin' }))

    const rolelessReference = doc(testEnvironment.authenticatedContext('sam').firestore(), 'users/sam')
    await assertSucceeds(setDoc(rolelessReference, userDataWithoutRole('sam')))
  })

  it('allows signed-in users to read public profiles, but only owners to write them', async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'publicProfiles/alex'), {
        name: 'Alex', photoURL: null, updatedAt: 1,
      })
    })
    const other = testEnvironment.authenticatedContext('sam').firestore()
    await assertSucceeds(getDoc(doc(other, 'publicProfiles/alex')))
    await assertFails(getDocs(collection(other, 'publicProfiles')))
    await assertFails(updateDoc(doc(other, 'publicProfiles/alex'), { name: 'Sam' }))
    await assertFails(getDoc(doc(testEnvironment.unauthenticatedContext().firestore(), 'publicProfiles/alex')))

    const owner = testEnvironment.authenticatedContext('alex').firestore()
    await assertSucceeds(updateDoc(doc(owner, 'publicProfiles/alex'), { name: 'Alex Updated' }))
    await assertSucceeds(deleteDoc(doc(owner, 'publicProfiles/alex')))
  })

  it('rejects extra public profile fields on create and update', async () => {
    const reference = doc(testEnvironment.authenticatedContext('alex').firestore(), 'publicProfiles/alex')
    await assertFails(setDoc(reference, {
      name: 'Alex', photoURL: null, updatedAt: 1, email: 'alex@example.test',
    }))
    await assertSucceeds(setDoc(reference, { name: 'Alex', photoURL: null, updatedAt: 1 }))
    await assertFails(updateDoc(reference, { role: 'student' }))
  })
})
