import {
  collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, runTransaction, Timestamp, where,
  type Firestore,
} from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { parseQuiz } from '../schemas'
import { defaultQuizSettings } from '../schemas/settings'
import type { NewQuiz, Quiz, QuizPatch, QuizStatus } from '../types'
import { quizRef } from './paths'

export type QuizRecord = Quiz & { id: string }
const asRecord = (id: string, value: unknown): QuizRecord => ({ ...parseQuiz(value), id })

function cleanFlashcardSettings(mode: Quiz['mode'], settings: Quiz['settings']) {
  return mode === 'flashcards' ? { ...settings, ...defaultQuizSettings('flashcards'), participation: settings.participation, timeLimitMinutes: settings.timeLimitMinutes, attemptsAllowed: settings.attemptsAllowed, shuffleQuestions: settings.shuffleQuestions, shuffleOptions: settings.shuffleOptions } : settings
}

export async function createQuiz(ownerId: string, ownerName: string, input: NewQuiz, db: Firestore = firestore): Promise<string> {
  if (!input.classId?.trim()) throw new Error('Choose an active class before creating a quiz.')
  const ref = doc(collection(db, 'quizzes'))
  const now = Timestamp.now()
  const quiz: Quiz = {
    ownerId, ownerName, classId: input.classId, title: input.title, description: input.description, tags: input.tags,
    mode: input.mode, status: 'draft', questionCount: 0, createdAt: now, updatedAt: now,
    publishedAt: null, settings: cleanFlashcardSettings(input.mode, input.settings),
  }
  const parsed = parseQuiz(quiz)
  await runTransaction(db, async (transaction) => {
    const classSnapshot = await transaction.get(doc(db, 'classes', input.classId!))
    if (!classSnapshot.exists() || classSnapshot.data().ownerId !== ownerId || classSnapshot.data().status !== 'active') throw new Error('Choose an active class that you own.')
    transaction.set(ref, parsed)
  })
  return ref.id
}

export async function updateQuiz(quizId: string, patch: QuizPatch, db: Firestore = firestore): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const ref = quizRef(db, quizId)
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists()) throw new Error('Quiz not found')
    const existing = parseQuiz(snapshot.data())
    const mode = patch.mode ?? existing.mode
    const settings = cleanFlashcardSettings(mode, patch.settings ?? existing.settings)
    const classId = patch.classId ?? existing.classId
    if (classId !== existing.classId) {
      if (existing.status !== 'draft' || !classId) throw new Error('A quiz can only be assigned to an active class while it is a draft.')
      const classSnapshot = await transaction.get(doc(db, 'classes', classId))
      if (!classSnapshot.exists() || classSnapshot.data().ownerId !== existing.ownerId || classSnapshot.data().status !== 'active') throw new Error('Choose an active class that you own.')
    }
    const next = parseQuiz({ ...existing, ...patch, ...(classId ? { classId } : {}), mode, settings, updatedAt: Timestamp.now() })
    transaction.set(ref, { ...patch, ...(classId ? { classId } : {}), mode, settings, updatedAt: next.updatedAt }, { merge: true })
  })
}

export async function getQuiz(quizId: string, db: Firestore = firestore): Promise<QuizRecord | null> {
  const snapshot = await getDoc(quizRef(db, quizId))
  return snapshot.exists() ? asRecord(snapshot.id, snapshot.data()) : null
}

export async function listOwnerQuizzes(ownerId: string, db: Firestore = firestore): Promise<QuizRecord[]> {
  const result = await getDocs(query(collection(db, 'quizzes'), where('ownerId', '==', ownerId), orderBy('updatedAt', 'desc')))
  return result.docs.map((snapshot) => asRecord(snapshot.id, snapshot.data()))
}

export function watchOwnerQuizzes(ownerId: string, onChange: (quizzes: QuizRecord[]) => void, onError: (error: Error) => void, db: Firestore = firestore) {
  return onSnapshot(query(collection(db, 'quizzes'), where('ownerId', '==', ownerId), orderBy('updatedAt', 'desc')),
    (snapshot) => onChange(snapshot.docs.map((item) => asRecord(item.id, item.data()))), onError)
}

async function setStatus(quizId: string, status: QuizStatus, db: Firestore): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const ref = quizRef(db, quizId)
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists()) throw new Error('Quiz not found')
    const quiz = parseQuiz(snapshot.data())
    if (status === 'published') {
      if (!quiz.title.trim()) throw new Error('A title is required before publishing')
      if (quiz.questionCount < 1) throw new Error('Add at least one question before publishing')
      if (!quiz.classId) throw new Error('Assign this quiz to an active class before publishing.')
      const classSnapshot = await transaction.get(doc(db, 'classes', quiz.classId))
      if (!classSnapshot.exists() || classSnapshot.data().ownerId !== quiz.ownerId || classSnapshot.data().status !== 'active') throw new Error('Publishing requires an active class that you own.')
    }
    transaction.update(ref, { status, updatedAt: Timestamp.now(), ...(status === 'published' ? { publishedAt: Timestamp.now() } : status === 'draft' ? { publishedAt: null } : {}) })
  })
}

export const publishQuiz = (quizId: string, db: Firestore = firestore) => setStatus(quizId, 'published', db)
export const unpublishQuiz = (quizId: string, db: Firestore = firestore) => setStatus(quizId, 'draft', db)
export const archiveQuiz = (quizId: string, db: Firestore = firestore) => setStatus(quizId, 'archived', db)
export const restoreQuiz = (quizId: string, db: Firestore = firestore) => setStatus(quizId, 'draft', db)
