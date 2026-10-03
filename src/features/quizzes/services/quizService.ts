import {
  collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, runTransaction, setDoc, Timestamp, where,
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
  const ref = doc(collection(db, 'quizzes'))
  const now = Timestamp.now()
  const quiz: Quiz = {
    ownerId, ownerName, title: input.title, description: input.description, tags: input.tags,
    mode: input.mode, status: 'draft', questionCount: 0, createdAt: now, updatedAt: now,
    publishedAt: null, settings: cleanFlashcardSettings(input.mode, input.settings),
  }
  await setDoc(ref, parseQuiz(quiz))
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
    const next = parseQuiz({ ...existing, ...patch, mode, settings, updatedAt: Timestamp.now() })
    transaction.set(ref, { ...patch, mode, settings, updatedAt: next.updatedAt }, { merge: true })
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

export async function listPublishedQuizzes(db: Firestore = firestore): Promise<QuizRecord[]> {
  const result = await getDocs(query(collection(db, 'quizzes'), where('status', '==', 'published'), orderBy('publishedAt', 'desc')))
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
    }
    transaction.update(ref, { status, updatedAt: Timestamp.now(), ...(status === 'published' ? { publishedAt: Timestamp.now() } : status === 'draft' ? { publishedAt: null } : {}) })
  })
}

export const publishQuiz = (quizId: string, db: Firestore = firestore) => setStatus(quizId, 'published', db)
export const unpublishQuiz = (quizId: string, db: Firestore = firestore) => setStatus(quizId, 'draft', db)
export const archiveQuiz = (quizId: string, db: Firestore = firestore) => setStatus(quizId, 'archived', db)
export const restoreQuiz = (quizId: string, db: Firestore = firestore) => setStatus(quizId, 'draft', db)
