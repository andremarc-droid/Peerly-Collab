import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import rules from '../../../firestore.rules?raw'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const projectId = 'demo-peerly-collab'
let environment: RulesTestEnvironment

const card = (i: number) => ({ id: `c${i}`, front: `Front ${i}`, back: `Back ${i}` })

function deck(overrides: Record<string, unknown> = {}) {
  const now = new Date()
  return {
    ownerId: 'owner',
    classId: 'class-a',
    kind: 'class',
    title: 'Cell biology',
    description: '',
    status: 'draft',
    cardCount: 1,
    cards: [card(1)],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: 8180, rules },
  })
})

afterAll(async () => {
  await environment.cleanup()
})

beforeEach(async () => {
  await environment.clearFirestore()
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await db.doc('classes/class-a').set({ ownerId: 'owner' })
    await db.doc('enrollments/class-a_student').set({ status: 'active' })
    await db.doc('enrollments/class-a_other-student').set({ status: 'active' })
    await db.doc('enrollments/class-a_blocked-student').set({ status: 'blocked' })

    await db.doc('classes/class-a/flashcardDecks/pub-deck').set(deck({ status: 'published' }))
    await db.doc('classes/class-a/flashcardDecks/draft-deck').set(deck({ status: 'draft' }))
    await db.doc('classes/class-a/flashcardDecks/personal-deck').set(
      deck({ ownerId: 'student', kind: 'personal', status: 'private' }),
    )
  })
})

describe('Flashcard deck security rules', () => {
  it('allows collection-group listing of only the signed-in owner’s personal decks', async () => {
    const owner = environment.authenticatedContext('student').firestore()
    const other = environment.authenticatedContext('outsider').firestore()
    const signedOut = environment.unauthenticatedContext().firestore()
    const ownQuery = query(
      collectionGroup(owner, 'flashcardDecks'),
      where('kind', '==', 'personal'),
      where('ownerId', '==', 'student'),
    )
    await assertSucceeds(getDocs(ownQuery))
    await assertFails(getDocs(query(
      collectionGroup(other, 'flashcardDecks'),
      where('kind', '==', 'personal'),
      where('ownerId', '==', 'student'),
    )))
    await assertFails(getDocs(query(
      collectionGroup(signedOut, 'flashcardDecks'),
      where('kind', '==', 'personal'),
      where('ownerId', '==', 'student'),
    )))
  })

  it('class decks: only the class owner sees drafts; active students see published', async () => {
    const owner = environment.authenticatedContext('owner').firestore()
    const student = environment.authenticatedContext('student').firestore()
    const blocked = environment.authenticatedContext('blocked-student').firestore()
    const outsider = environment.authenticatedContext('outsider').firestore()

    await assertSucceeds(getDoc(doc(owner, 'classes/class-a/flashcardDecks/draft-deck')))
    await assertSucceeds(getDoc(doc(owner, 'classes/class-a/flashcardDecks/pub-deck')))

    await assertSucceeds(getDoc(doc(student, 'classes/class-a/flashcardDecks/pub-deck')))
    await assertFails(getDoc(doc(student, 'classes/class-a/flashcardDecks/draft-deck')))

    await assertFails(getDoc(doc(blocked, 'classes/class-a/flashcardDecks/pub-deck')))
    await assertFails(getDoc(doc(outsider, 'classes/class-a/flashcardDecks/pub-deck')))

    await assertSucceeds(
      getDocs(
        query(
          collection(student, 'classes/class-a/flashcardDecks'),
          where('kind', '==', 'class'),
          where('status', '==', 'published'),
        ),
      ),
    )
    await assertFails(getDocs(collection(student, 'classes/class-a/flashcardDecks')))
  })

  describe('Flashcard deck sharing rules', () => {
    const invitePath = 'classes/class-a/flashcardDecks/pub-deck/invites/0123456789abcdefghijklmnopqrstuv'
    const memberPath = 'classes/class-a/flashcardDecks/pub-deck/members/student'

    async function addInvite() {
      const owner = environment.authenticatedContext('owner').firestore()
      await setDoc(doc(owner, invitePath), {
        createdBy: 'owner',
        role: 'editor',
        active: true,
        createdAt: serverTimestamp(),
        expiresAt: null,
      })
    }

    async function joinAsStudent(role = 'editor') {
      const student = environment.authenticatedContext('student').firestore()
      await setDoc(doc(student, memberPath), {
        uid: 'student',
        role,
        displayName: 'Student',
        invitedBy: 'owner',
        grantedByToken: '0123456789abcdefghijklmnopqrstuv',
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    }

    it('lets the owner invite an active class member and only grants the invited role', async () => {
      await addInvite()
      await assertSucceeds(joinAsStudent())

      const student = environment.authenticatedContext('student').firestore()
      await assertSucceeds(getDoc(doc(student, 'classes/class-a/flashcardDecks/pub-deck')))
      await assertSucceeds(updateDoc(doc(student, 'classes/class-a/flashcardDecks/pub-deck'), {
        title: 'Shared edit',
        updatedAt: serverTimestamp(),
      }))
      await assertFails(setDoc(doc(student, 'classes/class-a/flashcardDecks/pub-deck/members/other-student'), {
        uid: 'other-student',
        role: 'editor',
        displayName: 'Other',
        invitedBy: 'owner',
        grantedByToken: '0123456789abcdefghijklmnopqrstuv',
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }))
    })

    it('supports viewer access without deck writes and permits the owner to change roles', async () => {
      await addInvite()
      await environment.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc(invitePath).update({ role: 'viewer' })
      })
      await joinAsStudent('viewer')

      const student = environment.authenticatedContext('student').firestore()
      await assertSucceeds(getDoc(doc(student, 'classes/class-a/flashcardDecks/pub-deck')))
      await assertFails(updateDoc(doc(student, 'classes/class-a/flashcardDecks/pub-deck'), {
        title: 'Not allowed',
        updatedAt: serverTimestamp(),
      }))

      const owner = environment.authenticatedContext('owner').firestore()
      await assertSucceeds(updateDoc(doc(owner, memberPath), {
        role: 'editor',
        updatedAt: serverTimestamp(),
      }))
    })

    it('limits invite creation and membership to the deck owner and active class members', async () => {
      const student = environment.authenticatedContext('student').firestore()
      await assertFails(setDoc(doc(student, invitePath), {
        createdBy: 'student',
        role: 'editor',
        active: true,
        createdAt: serverTimestamp(),
        expiresAt: null,
      }))

      await addInvite()
      const blocked = environment.authenticatedContext('blocked-student').firestore()
      await assertFails(setDoc(doc(blocked, 'classes/class-a/flashcardDecks/pub-deck/members/blocked-student'), {
        uid: 'blocked-student',
        role: 'editor',
        displayName: 'Blocked',
        invitedBy: 'owner',
        grantedByToken: '0123456789abcdefghijklmnopqrstuv',
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }))
    })

    it('allows collaborators to record activity and their own presence only', async () => {
      await addInvite()
      await joinAsStudent()
      const student = environment.authenticatedContext('student').firestore()
      await assertSucceeds(setDoc(doc(student, 'classes/class-a/flashcardDecks/pub-deck/activity/change-1'), {
        actorId: 'student',
        actorName: 'Student',
        type: 'edit',
        summary: 'Updated flashcards',
        createdAt: serverTimestamp(),
      }))
      await assertSucceeds(setDoc(doc(student, 'classes/class-a/flashcardDecks/pub-deck/presence/student'), {
        uid: 'student',
        name: 'Student',
        online: true,
        lastActive: serverTimestamp(),
      }))
      await assertFails(setDoc(doc(student, 'classes/class-a/flashcardDecks/pub-deck/presence/other-student'), {
        uid: 'other-student',
        name: 'Other',
        online: true,
        lastActive: serverTimestamp(),
      }))
    })

    it('does not let view-only members forge edit activity', async () => {
      await addInvite()
      await environment.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc(invitePath).update({ role: 'viewer' })
      })
      await joinAsStudent('viewer')
      const student = environment.authenticatedContext('student').firestore()
      await assertFails(setDoc(doc(student, 'classes/class-a/flashcardDecks/pub-deck/activity/forged-edit'), {
        actorId: 'student',
        actorName: 'Student',
        type: 'edit',
        summary: 'Pretended to edit',
        createdAt: serverTimestamp(),
      }))
      await assertFails(setDoc(doc(student, 'classes/class-a/flashcardDecks/pub-deck/activity/joined'), {
        actorId: 'student',
        actorName: 'Student',
        type: 'member',
        summary: 'Joined this deck',
        createdAt: serverTimestamp(),
      }))
    })
  })

  it('class decks: only the class owner can create, update, or delete', async () => {
    const owner = environment.authenticatedContext('owner').firestore()
    const student = environment.authenticatedContext('student').firestore()

    await assertSucceeds(setDoc(doc(owner, 'classes/class-a/flashcardDecks/new-deck'), deck()))
    await assertFails(
      setDoc(
        doc(student, 'classes/class-a/flashcardDecks/student-class-deck'),
        deck({ ownerId: 'student' }),
      ),
    )

    await assertSucceeds(
      updateDoc(doc(owner, 'classes/class-a/flashcardDecks/new-deck'), {
        status: 'published',
        updatedAt: new Date(),
      }),
    )
    await assertFails(
      updateDoc(doc(student, 'classes/class-a/flashcardDecks/pub-deck'), { title: 'Tampered' }),
    )

    await assertFails(deleteDoc(doc(student, 'classes/class-a/flashcardDecks/pub-deck')))
    await assertSucceeds(deleteDoc(doc(owner, 'classes/class-a/flashcardDecks/new-deck')))
  })

  it('personal decks: private to the student; class owner may only delete', async () => {
    const owner = environment.authenticatedContext('owner').firestore()
    const student = environment.authenticatedContext('student').firestore()
    const otherStudent = environment.authenticatedContext('other-student').firestore()
    const outsider = environment.authenticatedContext('outsider').firestore()

    await assertSucceeds(getDoc(doc(student, 'classes/class-a/flashcardDecks/personal-deck')))
    await assertFails(getDoc(doc(owner, 'classes/class-a/flashcardDecks/personal-deck')))
    await assertFails(getDoc(doc(otherStudent, 'classes/class-a/flashcardDecks/personal-deck')))

    await assertSucceeds(
      getDocs(
        query(
          collection(student, 'classes/class-a/flashcardDecks'),
          where('kind', '==', 'personal'),
          where('ownerId', '==', 'student'),
        ),
      ),
    )

    const mine = deck({ ownerId: 'other-student', kind: 'personal', status: 'private' })
    await assertSucceeds(setDoc(doc(otherStudent, 'classes/class-a/flashcardDecks/os-deck'), mine))
    await assertFails(
      setDoc(doc(otherStudent, 'classes/class-a/flashcardDecks/os-public'), {
        ...mine,
        status: 'published',
      }),
    )
    await assertFails(
      setDoc(doc(outsider, 'classes/class-a/flashcardDecks/outsider-deck'), {
        ...mine,
        ownerId: 'outsider',
      }),
    )

    await assertSucceeds(
      updateDoc(doc(student, 'classes/class-a/flashcardDecks/personal-deck'), {
        title: 'Renamed',
        updatedAt: new Date(),
      }),
    )
    await assertFails(
      updateDoc(doc(otherStudent, 'classes/class-a/flashcardDecks/personal-deck'), {
        title: 'Tampered',
      }),
    )
    await assertFails(
      updateDoc(doc(owner, 'classes/class-a/flashcardDecks/personal-deck'), { title: 'Tampered' }),
    )

    await assertFails(deleteDoc(doc(otherStudent, 'classes/class-a/flashcardDecks/personal-deck')))
    await assertSucceeds(deleteDoc(doc(student, 'classes/class-a/flashcardDecks/personal-deck')))
    await assertSucceeds(deleteDoc(doc(owner, 'classes/class-a/flashcardDecks/os-deck')))
  })

  it('enforces immutable fields and card limits', async () => {
    const owner = environment.authenticatedContext('owner').firestore()
    const ref = doc(owner, 'classes/class-a/flashcardDecks/draft-deck')

    await assertFails(updateDoc(ref, { kind: 'personal', status: 'private' }))
    await assertFails(updateDoc(ref, { ownerId: 'someone-else' }))
    await assertFails(updateDoc(ref, { classId: 'class-b' }))

    const many = Array.from({ length: 101 }, (_, i) => card(i))
    await assertFails(updateDoc(ref, { cards: many, cardCount: 101 }))
    await assertFails(updateDoc(ref, { cards: [], cardCount: 0 }))
    await assertFails(updateDoc(ref, { cardCount: 5 }))

    const hundred = Array.from({ length: 100 }, (_, i) => card(i))
    await assertSucceeds(updateDoc(ref, { cards: hundred, cardCount: 100, updatedAt: new Date() }))
  })
})
