/** What a team may see of a group quiz. Every document here is written by Cloud Functions; the browser only reads them. */

export type TeamStatus = 'forming' | 'ready' | 'in_progress' | 'submitted'
export type SessionPhase = 'answering' | 'review' | 'finished'
/** A multiple choice / true-false answer is an option id, identification is text, fill-in-the-blank is one string per blank. */
export type TeamAnswer = string | string[]

export interface Team {
  id: string
  name: string
  memberIds: string[]
  memberNames: Record<string, string>
  representativeId: string
  /** Only teams students formed themselves have a code. */
  code: string | null
  studyGroupId: string | null
  status: TeamStatus
  score: number | null
  maxScore: number | null
}

export interface TeamQuestion {
  id: string
  index: number
  type: string
  prompt: string
  points: number
  options: Array<{ id: string; text: string }>
}

export interface TeamSession {
  phase: SessionPhase
  currentIndex: number
  total: number
  /** Server clock, milliseconds. Compare with a server-corrected "now" and never trust the device clock for fairness. */
  questionStartedAt: number | null
  questionEndsAt: number | null
  reviewStartedAt: number | null
  question: TeamQuestion | null
  /** Who answered; what they chose stays hidden until everyone answered (or the question closed). */
  answered: Record<string, true>
  picks: Record<string, TeamAnswer> | null
  locked: boolean
  ready: Record<string, true>
}

export interface RevealResult {
  correct: boolean
  pointsAwarded: number
  correctAnswer: TeamAnswer
  explanation: string
}

export interface TeamReveal {
  index: number
  questionId: string
  question: { type: string; prompt: string; points: number; options: Array<{ id: string; text: string }> }
  finalAnswer: TeamAnswer | null
  picks: Record<string, TeamAnswer>
  lockedBy: string | null
  auto: boolean
  /** Null until the quiz reveals answers (after each question, or after the team submits). */
  result: RevealResult | null
}
