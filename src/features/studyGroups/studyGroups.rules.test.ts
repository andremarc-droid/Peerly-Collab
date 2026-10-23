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

  describe('sharedItems rules across all kinds', () => {
    const groupId = 'grp-items-1'

    beforeEach(async () => {
      await environment.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().doc(`studyGroups/${groupId}`).set(validGroup(groupId, 'alice'))
        await ctx.firestore().doc(`studyGroups/${groupId}/members/alice`).set({
          uid: 'alice',
          displayName: 'Alice',
          role: 'owner',
          joinedAt: new Date(),
        })
        await ctx.firestore().doc(`studyGroups/${groupId}/members/bob`).set({
          uid: 'bob',
          displayName: 'Bob',
          role: 'member',
          joinedAt: new Date(),
        })
      })
    })

    it('allows a group member (bob) to share a flashcard deck snapshot', async () => {
      const bob = environment.authenticatedContext('bob').firestore()
      const now = serverTimestamp()
      await assertSucceeds(
        setDoc(doc(bob, 'studyGroups', groupId, 'sharedItems', 'item-deck-1'), {
          id: 'item-deck-1',
          kind: 'deck',
          title: 'Cell Organelles',
          summary: 'Mitochondria and more',
          sharedByUid: 'bob',
          sharedByName: 'Bob',
          sharedAt: now,
          version: 1,
          payload: {
            cardCount: 2,
            cards: [
              { id: 'c1', front: 'Mitochondria', back: 'Powerhouse' },
              { id: 'c2', front: 'Nucleus', back: 'Control center' },
            ],
          },
        }),
      )
    })

    it('allows a group member to share a learning canvas snapshot', async () => {
      const bob = environment.authenticatedContext('bob').firestore()
      const now = serverTimestamp()
      await assertSucceeds(
        setDoc(doc(bob, 'studyGroups', groupId, 'sharedItems', 'item-canvas-1'), {
          id: 'item-canvas-1',
          kind: 'canvas',
          title: 'Cell Structure Graph',
          sharedByUid: 'bob',
          sharedByName: 'Bob',
          sharedAt: now,
          version: 1,
          payload: {
            nodeCount: 1,
            edgeCount: 0,
            nodes: [{ id: 'n1', type: 'text', text: 'Overview' }],
            edges: [],
            viewport: { x: 0, y: 0, zoom: 1 },
          },
        }),
      )
    })

    it('allows a group member to share a lesson plan snapshot without source material', async () => {
      const bob = environment.authenticatedContext('bob').firestore()
      const now = serverTimestamp()
      await assertSucceeds(
        setDoc(doc(bob, 'studyGroups', groupId, 'sharedItems', 'item-plan-1'), {
          id: 'item-plan-1',
          kind: 'lessonPlan',
          title: 'Genetics Unit',
          sharedByUid: 'bob',
          sharedByName: 'Bob',
          sharedAt: now,
          version: 1,
          payload: {
            topic: 'Genetics',
            level: 'beginner',
            lessonCount: 1,
            order: ['les-1'],
            lessons: {
              'les-1': {
                title: 'Mendelian Genetics',
                objective: 'Understand alleles',
                content: 'Gregor Mendel studied peas.',
                keyPoints: ['dominant', 'recessive'],
              },
            },
          },
        }),
      )
    })

    it('denies sharing a lesson plan if source material is included in payload', async () => {
      const bob = environment.authenticatedContext('bob').firestore()
      const now = serverTimestamp()
      await assertFails(
        setDoc(doc(bob, 'studyGroups', groupId, 'sharedItems', 'item-plan-bad'), {
          id: 'item-plan-bad',
          kind: 'lessonPlan',
          title: 'Genetics Unit with secret notes',
          sharedByUid: 'bob',
          sharedByName: 'Bob',
          sharedAt: now,
          version: 1,
          payload: {
            topic: 'Genetics',
            level: 'beginner',
            lessonCount: 1,
            order: ['les-1'],
            lessons: { 'les-1': { title: 'Mendel' } },
            source: 'Confidential source text',
          },
        }),
      )
    })

    it('allows a group member to share a note snapshot', async () => {
      const bob = environment.authenticatedContext('bob').firestore()
      const now = serverTimestamp()
      await assertSucceeds(
        setDoc(doc(bob, 'studyGroups', groupId, 'sharedItems', 'item-note-1'), {
          id: 'item-note-1',
          kind: 'note',
          title: 'Lecture 1 Summary',
          sharedByUid: 'bob',
          sharedByName: 'Bob',
          sharedAt: now,
          version: 1,
          payload: {
            text: 'Key takeaways from the lecture.',
          },
        }),
      )
    })

    it('denies sharing an item if sharedByUid does not match auth uid', async () => {
      const bob = environment.authenticatedContext('bob').firestore()
      const now = serverTimestamp()
      await assertFails(
        setDoc(doc(bob, 'studyGroups', groupId, 'sharedItems', 'item-spoof'), {
          id: 'item-spoof',
          kind: 'note',
          title: 'Spoofed note',
          sharedByUid: 'alice', // Bob claiming to be Alice
          sharedByName: 'Alice',
          sharedAt: now,
          version: 1,
          payload: { text: 'Spoofed' },
        }),
      )
    })

    it('denies non-members from reading or creating sharedItems', async () => {
      const charlie = environment.authenticatedContext('charlie').firestore()
      const now = serverTimestamp()

      await assertFails(
        setDoc(doc(charlie, 'studyGroups', groupId, 'sharedItems', 'item-charlie'), {
          id: 'item-charlie',
          kind: 'note',
          title: 'Charlie note',
          sharedByUid: 'charlie',
          sharedByName: 'Charlie',
          sharedAt: now,
          version: 1,
          payload: { text: 'Denied' },
        }),
      )

      await assertFails(getDoc(doc(charlie, 'studyGroups', groupId, 'sharedItems', 'item-deck-1')))
    })

    it('allows sharer to update their shared item and denies other members from updating it', async () => {
      const bob = environment.authenticatedContext('bob').firestore()
      const alice = environment.authenticatedContext('alice').firestore()
      const now = serverTimestamp()

      await assertSucceeds(
        setDoc(doc(bob, 'studyGroups', groupId, 'sharedItems', 'item-to-update'), {
          id: 'item-to-update',
          kind: 'note',
          title: 'Original Title',
          sharedByUid: 'bob',
          sharedByName: 'Bob',
          sharedAt: now,
          version: 1,
          payload: { text: 'V1 content' },
        }),
      )

      // Alice (owner, but not sharer) tries to update Bob's item -> denied
      await assertFails(
        setDoc(doc(alice, 'studyGroups', groupId, 'sharedItems', 'item-to-update'), {
          id: 'item-to-update',
          kind: 'note',
          title: 'Alice Hijack',
          sharedByUid: 'alice',
          sharedByName: 'Alice',
          sharedAt: now,
          version: 2,
          payload: { text: 'Hijacked' },
        }),
      )

      // Bob updates his own item -> allowed
      await assertSucceeds(
        setDoc(doc(bob, 'studyGroups', groupId, 'sharedItems', 'item-to-update'), {
          id: 'item-to-update',
          kind: 'note',
          title: 'Updated Title',
          sharedByUid: 'bob',
          sharedByName: 'Bob',
          sharedAt: now,
          version: 2,
          payload: { text: 'V2 content' },
        }),
      )
    })

    it('allows sharer and group owner to delete shared item, denies third party', async () => {
      const bob = environment.authenticatedContext('bob').firestore()
      const alice = environment.authenticatedContext('alice').firestore()
      const charlie = environment.authenticatedContext('charlie').firestore()
      const now = serverTimestamp()

      // Bob shares an item
      await assertSucceeds(
        setDoc(doc(bob, 'studyGroups', groupId, 'sharedItems', 'item-del-1'), {
          id: 'item-del-1',
          kind: 'note',
          title: 'Delete test',
          sharedByUid: 'bob',
          sharedByName: 'Bob',
          sharedAt: now,
          version: 1,
          payload: { text: 'Delete me' },
        }),
      )

      // Charlie (non-member) cannot delete
      await assertFails(deleteDoc(doc(charlie, 'studyGroups', groupId, 'sharedItems', 'item-del-1')))

      // Alice (owner) CAN delete
      await assertSucceeds(deleteDoc(doc(alice, 'studyGroups', groupId, 'sharedItems', 'item-del-1')))
    })
  })
})

