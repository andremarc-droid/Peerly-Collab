import type { Timestamp } from 'firebase/firestore'

export type QuizMode = 'quiz' | 'flashcards'
export type QuizStatus = 'draft' | 'published' | 'archived'
export type QuestionType = 'multiple_choice' | 'true_false' | 'identification' | 'fill_blank' | 'flashcard'
export type AnswerReveal = 'after_each' | 'after_submit' | 'never'
export type ScoreVisibility = 'immediate' | 'after_release' | 'hidden'

export type AnswerMode = 'representative' | 'everyone'
export type TeamFormation = 'assigned' | 'self'

export interface GroupParticipation {
  type: 'group'
  groupSize: number
  /** representative: one teammate submits. everyone: each member answers, then any member locks the team's final answer. */
  answerMode: AnswerMode
  teamFormation: TeamFormation
  /** The team does not advance until everyone (or the representative) has answered. */
  waitForEveryone: boolean
  /** Seconds per question, enforced by the server. null means no timer. */
  questionTimeSec: number | null
}

export type Participation = { type: 'individual' } | GroupParticipation

export interface QuizSettings {
  answerReveal: AnswerReveal
  participation: Participation
  scoreVisibility: ScoreVisibility
  scoresReleased: boolean
  /** Time allowed for EACH question, in whole minutes (rounded up from timeLimitSeconds). Kept so older screens and records keep working. */
  timeLimitMinutes: number | null
  /** Exact time allowed for each question, in seconds. When absent (older quizzes) it is timeLimitMinutes * 60. */
  timeLimitSeconds?: number | null
  /** Students can start the quiz from this moment. null means it is open as soon as it is published. */
  opensAt?: Timestamp | null
  /** Deadline: students cannot start the quiz after this moment, and an attempt in progress is submitted at it. */
  closesAt?: Timestamp | null
  attemptsAllowed: number | null
  shuffleQuestions: boolean
  shuffleOptions: boolean
}

export interface Quiz {
  ownerId: string
  ownerName: string
  classId: string | null
  title: string
  description: string
  tags: string[]
  mode: QuizMode
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

export type SubmittedAnswer = string | string[]
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
  /** Timed quizzes only: the question the student is on and when its countdown started. A refresh keeps the same clock. */
  questionTimer?: { index: number; startedAtMs: number }
  /** Only on attempts written for a team: the team this attempt belongs to. Solo attempts never have these. */
  teamId?: string
  teamName?: string
}

export interface QuestionResult {
  correct: boolean | null
  pointsAwarded: number
  overridden: boolean
}

export interface QuizResult {
  userId: string
  score: number
  maxScore: number
  perQuestion: Record<string, QuestionResult>
  gradedAt: Timestamp
}

export interface QuizParticipant {
  userId: string
  userName: string
  createdAt: Timestamp
  updatedAt: Timestamp
  attemptCount: number
  activeAttemptId: string | null
}

export type NewQuiz = Pick<Quiz, 'title' | 'description' | 'tags' | 'mode' | 'settings'> & { classId?: string }
export type QuizPatch = Partial<Pick<Quiz, 'title' | 'description' | 'tags' | 'settings' | 'classId' | 'questionCount'>>

export function quizModeLabel(mode: string): string {
  if (mode === 'flashcards') return 'Flashcards'
  return 'Quiz'
}
