import type { Timestamp } from 'firebase/firestore'
import type { CanvasAnswerKey, CanvasQuestion } from '../../canvas/types'

export type QuizMode = 'quiz' | 'flashcards' | 'canvas'
export type QuizStatus = 'draft' | 'published' | 'archived'
export type QuestionType = 'multiple_choice' | 'true_false' | 'identification' | 'fill_blank' | 'flashcard' | 'canvas'
export type AnswerReveal = 'after_each' | 'after_submit' | 'never'
export type ScoreVisibility = 'immediate' | 'after_release' | 'hidden'

export type Participation =
  | { type: 'individual' }
  | { type: 'group'; groupSize: number }

export interface QuizSettings {
  answerReveal: AnswerReveal
  participation: Participation
  scoreVisibility: ScoreVisibility
  scoresReleased: boolean
  timeLimitMinutes: number | null
  attemptsAllowed: number | null
  shuffleQuestions: boolean
  shuffleOptions: boolean
}

export type BoardKind = 'prebuilt' | 'blank'

export interface Quiz {
  ownerId: string
  ownerName: string
  classId: string | null
  title: string
  description: string
  tags: string[]
  mode: QuizMode
  boardKind?: BoardKind
  status: QuizStatus
  questionCount: number
  createdAt: Timestamp
  updatedAt: Timestamp
  publishedAt: Timestamp | null
  settings: QuizSettings
}

export interface QuestionOption {
  id: string
  text: string
}

interface QuestionBase {
  order: number
  prompt: string
  points: number
}

export interface MultipleChoiceQuestion extends QuestionBase {
  type: 'multiple_choice'
  options: QuestionOption[]
}

export interface TrueFalseQuestion extends QuestionBase {
  type: 'true_false'
  options: QuestionOption[]
}

export interface IdentificationQuestion extends QuestionBase {
  type: 'identification'
}

export interface FillBlankQuestion extends QuestionBase {
  type: 'fill_blank'
}

export interface FlashcardQuestion extends QuestionBase {
  type: 'flashcard'
}

export type QuizQuestion =
  | MultipleChoiceQuestion
  | TrueFalseQuestion
  | IdentificationQuestion
  | FillBlankQuestion
  | FlashcardQuestion
  | CanvasQuestion

interface AnswerKeyBase {
  explanation: string
  caseSensitive: boolean
}

export interface ChoiceAnswerKey extends AnswerKeyBase {
  type: 'choice'
  correctOptionId: string
}

export interface IdentificationAnswerKey extends AnswerKeyBase {
  type: 'identification'
  acceptedAnswers: string[]
}

export interface FillBlankAnswerKey extends AnswerKeyBase {
  type: 'fill_blank'
  blanks: string[][]
}

export interface FlashcardAnswerKey extends AnswerKeyBase {
  type: 'flashcard'
  back: string
}

export type AnswerKey =
  | ChoiceAnswerKey
  | IdentificationAnswerKey
  | FillBlankAnswerKey
  | FlashcardAnswerKey
  | CanvasAnswerKey

export interface BlankCanvasAnswerCard {
  id: string
  type: 'note' | 'paragraph' | 'link'
  title?: string
  content: string
  url?: string
  position: { x: number; y: number }
}

export interface BlankCanvasAnswer {
  cards: BlankCanvasAnswerCard[]
  connections: string[]
}

export type SubmittedAnswer = string | string[] | BlankCanvasAnswer
export type AttemptStatus = 'in_progress' | 'submitted'

export interface QuizAttempt {
  userId: string
  userName: string
  attemptNumber: number
  status: AttemptStatus
  answers: Record<string, SubmittedAnswer>
  questionOrder: string[]
  optionOrder: Record<string, string[]>
  startedAt: Timestamp
  submittedAt: Timestamp | null
  timeSpentSeconds: number
}

export interface QuestionResult {
  correct: boolean | null
  pointsAwarded: number
  overridden: boolean
}

export type ReviewStatus = 'pending' | 'graded'

export interface QuizResult {
  userId: string
  score: number
  maxScore: number
  perQuestion: Record<string, QuestionResult>
  gradedAt: Timestamp
  reviewStatus?: ReviewStatus
  feedback?: string
  gradedBy?: string
}

export interface QuizParticipant {
  userId: string
  userName: string
  createdAt: Timestamp
  updatedAt: Timestamp
  attemptCount: number
  activeAttemptId: string | null
}

export type NewQuiz = Pick<Quiz, 'title' | 'description' | 'tags' | 'mode' | 'settings'> & { classId?: string; boardKind?: BoardKind }
export type QuizPatch = Partial<Pick<Quiz, 'title' | 'description' | 'tags' | 'settings' | 'classId' | 'questionCount'>>

export function quizModeLabel(mode: string): string {
  if (mode === 'canvas') return 'Canvas'
  if (mode === 'flashcards') return 'Flashcards'
  return 'Quiz'
}
