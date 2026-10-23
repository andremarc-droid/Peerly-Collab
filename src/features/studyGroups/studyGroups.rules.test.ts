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
  serverTimestamp,
} from 'firebase/firestore'
import rules from '../../../firestore.rules?raw'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const projectId = 'demo-peerly-collab'
let environment: RulesTestEnvironment

function validGroup(groupId = 'group-1', ownerId = 'alice', overrides: Record<string, unknown> = {}) {
  const now = serverTimestamp()
  return {
    id: groupId,
    name: 'Chemistry Crew',
    description: 'Weekly organic chemistry review',
    privacy: 'private',
    ownerId,
    ownerDisplayName: 'Alice',
    inviteCode: 'CHEM99',
    memberCount: 1,
    maxMembers: 50,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

const hasEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST)

describe.skipIf(!hasEmulator)('studyGroups rules', () => {
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

  it('allows owner to create a group with initial member count 1', async () => {
    const alice = environment.authenticatedContext('alice').firestore()
    await assertSucceeds(setDoc(doc(alice, 'studyGroups', 'grp-1'), validGroup('grp-1', 'alice')))
  })

  it('denies creating a group with forged memberCount > 1', async () => {
    const alice = environment.authenticatedContext('alice').firestore()
    await assertFails(
      setDoc(doc(alice, 'studyGroups', 'grp-1'), validGroup('grp-1', 'alice', { memberCount: 10 })),
    )
  })

  it('denies non-members from reading private group', async () => {
    await environment.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('studyGroups/grp-1').set(validGroup('grp-1', 'alice', { privacy: 'private' }))
    })

    const bob = environment.authenticatedContext('bob').firestore()
    await assertFails(getDoc(doc(bob, 'studyGroups', 'grp-1')))
  })

  it('allows anyone signed-in to read public group', async () => {
    await environment.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('studyGroups/grp-pub').set(validGroup('grp-pub', 'alice', { privacy: 'public' }))
    })

    const bob = environment.authenticatedContext('bob').firestore()
    await assertSucceeds(getDoc(doc(bob, 'studyGroups', 'grp-pub')))
  })

  it('allows member to read private group', async () => {
    await environment.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('studyGroups/grp-1').set(validGroup('grp-1', 'alice', { privacy: 'private' }))
      await ctx.firestore().doc('studyGroups/grp-1/members/bob').set({
        uid: 'bob',
        displayName: 'Bob',
        role: 'member',
        joinedAt: new Date(),
      })
    })

    const bob = environment.authenticatedContext('bob').firestore()
    await assertSucceeds(getDoc(doc(bob, 'studyGroups', 'grp-1')))
  })

  it('denies client directly mutating memberCount on group doc', async () => {
    await environment.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('studyGroups/grp-1').set(validGroup('grp-1', 'alice'))
    })

    const alice = environment.authenticatedContext('alice').firestore()
    await assertFails(
      updateDoc(doc(alice, 'studyGroups', 'grp-1'), { memberCount: 2 }),
    )
  })

  it('allows owner to delete their study group', async () => {
    await environment.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('studyGroups/grp-1').set(validGroup('grp-1', 'alice'))
    })

    const alice = environment.authenticatedContext('alice').firestore()
    await assertSucceeds(deleteDoc(doc(alice, 'studyGroups', 'grp-1')))
  })

  it('denies non-owner from deleting a study group', async () => {
    await environment.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('studyGroups/grp-1').set(validGroup('grp-1', 'alice'))
    })

    const bob = environment.authenticatedContext('bob').firestore()
    await assertFails(deleteDoc(doc(bob, 'studyGroups', 'grp-1')))
  })
})
