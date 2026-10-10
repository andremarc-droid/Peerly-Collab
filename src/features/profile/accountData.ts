import { FirebaseError } from 'firebase/app'
import { collection, deleteDoc, doc, getDocs, limit, query, where, writeBatch, type Firestore } from 'firebase/firestore'
import { firestore } from '../../lib/firebase/firestore'
import type { UserRole } from '../auth/roleIntent'
import { listMyClasses } from '../classes/services/classService'
import { deleteClassCascade } from '../classes/services/deleteClassCascade'
import { enrollmentsRef } from '../classes/services/paths'
import { deleteCanvasSubcollections } from '../learningCanvas/collab/cleanup'
import { deleteQuizCascade } from '../quizzes/services/deleteQuizCascade'
import { deleteMyTurnIns } from '../assignments/services/turnInService'
import { cleanupGroups } from '../groups/services'
import { cleanupGames } from '../games/services'

const PAGE = 100
const DECK_SUBCOLLECTIONS = ['members', 'invites', 'activity', 'presence'] as const

/** Deletes every document in a collection. A permission error means it isn't ours to clear, so it is skipped. */
async function emptyCollection(db: Firestore, path: string, ...segments: string[]): Promise<void> {
  const target = collection(db, path, ...segments)
  try {
    while (true) {
      const page = await getDocs(query(target, limit(PAGE)))
      if (page.empty) return
      const batch = writeBatch(db)
      page.docs.forEach((item) => batch.delete(item.ref))
      await batch.commit()
      if (page.size < PAGE) return
    }
  } catch (error) {
    if (error instanceof FirebaseError && error.code === 'permission-denied') return
    throw error
  }
}

async function deleteOwnedQuizzes(uid: string, db: Firestore): Promise<void> {
  while (true) {
    const page = await getDocs(query(collection(db, 'quizzes'), where('ownerId', '==', uid), limit(PAGE)))
    if (page.empty) return
    for (const item of page.docs) await deleteQuizCascade(item.id, db)
  }
}

/** Instructors own their classes, so everything inside them goes too (quizzes, modules, canvases, decks, enrollments). */
async function deleteOwnedClasses(uid: string, db: Firestore): Promise<void> {
  const classes = await listMyClasses(uid, db)
  for (const item of classes) await deleteClassCascade(item.id, db)
  await deleteOwnedQuizzes(uid, db)
}

async function deletePersonalCanvases(classId: string, uid: string, db: Firestore): Promise<void> {
  const canvases = await getDocs(query(
    collection(db, 'classes', classId, 'learningCanvases'),
    where('kind', '==', 'personal'),
    where('ownerId', '==', uid),
  ))
  for (const canvas of canvases.docs) {
    await deleteCanvasSubcollections(classId, canvas.id, db)
    await deleteDoc(doc(db, 'classes', classId, 'learningCanvases', canvas.id, 'content', 'main'))
    await deleteDoc(canvas.ref)
  }
}

async function deletePersonalDecks(classId: string, uid: string, db: Firestore): Promise<void> {
  const decks = await getDocs(query(
    collection(db, 'classes', classId, 'flashcardDecks'),
    where('kind', '==', 'personal'),
    where('ownerId', '==', uid),
  ))
  for (const deck of decks.docs) {
    for (const name of DECK_SUBCOLLECTIONS) await emptyCollection(db, 'classes', classId, 'flashcardDecks', deck.id, name)
    await deleteDoc(deck.ref)
  }
}

/** Students leave every class and take their private canvases and flashcard decks with them. */
async function leaveClasses(uid: string, db: Firestore): Promise<void> {
  // Turn-ins are only references to the student's own Drive files, which are never touched.
  await deleteMyTurnIns(uid, db)
  const enrollments = await getDocs(query(enrollmentsRef(db), where('uid', '==', uid)))
  for (const enrollment of enrollments.docs) {
    const { classId, status } = enrollment.data() as { classId?: unknown; status?: unknown }
    if (typeof classId !== 'string') continue
    await deletePersonalCanvases(classId, uid, db)
    await deletePersonalDecks(classId, uid, db)
    // A student blocked by an instructor can't remove that record themselves, so it stays with the class.
    if (status !== 'blocked') await deleteDoc(enrollment.ref)
  }
}

async function deleteProfileDocuments(uid: string, db: Firestore): Promise<void> {
  const batch = writeBatch(db)
  batch.delete(doc(db, 'publicProfiles', uid))
  batch.delete(doc(db, 'users', uid, 'stats', 'summary'))
  batch.delete(doc(db, 'users', uid))
  await batch.commit()
}

async function deleteLearningPlans(uid: string, db: Firestore): Promise<void> {
  const plans = await getDocs(collection(db, 'users', uid, 'lessonPlans'))
  for (const plan of plans.docs) {
    await emptyCollection(db, 'users', uid, 'lessonPlans', plan.id, 'lessons')
    await emptyCollection(db, 'users', uid, 'lessonPlans', plan.id, 'source')
    await deleteDoc(plan.ref)
  }
  await emptyCollection(db, 'users', uid, 'lessonProgress')
}

/**
 * Removes what this person owns, then their profile. The profile goes last because losing it sends
 * the app to the role screen, and because every earlier step can be safely retried if it fails.
 */
export async function deleteAccountData(uid: string, role: UserRole | null, db: Firestore = firestore): Promise<void> {
  await cleanupGroups()
  // Hosted games are deleted and the person is removed from the game they play. If this fails the error propagates,
  // nothing else is deleted and the Auth account stays, so the person can simply retry.
  await cleanupGames()
  await deleteLearningPlans(uid, db)
  await emptyCollection(db, 'users', uid, 'deckProgress')
  await emptyCollection(db, 'users', uid, 'studyAttempts')
  if (role === 'instructor') await deleteOwnedClasses(uid, db)
  else await leaveClasses(uid, db)
  await deleteProfileDocuments(uid, db)
}
