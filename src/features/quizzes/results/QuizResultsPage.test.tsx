import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QuizResultsPage } from './QuizResultsPage'
import { AttemptDetail } from './AttemptDetail'
import type { SavedQuestion } from '../services/questionService'
import type { AttemptResult } from './resultLogic'

const mocks = vi.hoisted(() => ({
  getQuiz: vi.fn(), listQuizAttempts: vi.fn(), getQuizResult: vi.fn(), watchQuestionPairs: vi.fn(), getClass: vi.fn(), listEnrollments: vi.fn(),
  updateQuiz: vi.fn(), setQuestionGradeOverride: vi.fn(), toast: vi.fn(),
}))

vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'teacher', email: 'teacher@test.dev' } }) }))
vi.mock('../../../app/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('../../../shared/ui/useToast', () => ({ useToast: () => ({ showToast: mocks.toast }) }))
vi.mock('../services/quizService', () => ({ getQuiz: mocks.getQuiz, updateQuiz: mocks.updateQuiz }))
vi.mock('../services/attemptService', () => ({ listQuizAttempts: mocks.listQuizAttempts }))
vi.mock('../services/resultService', () => ({ getQuizResult: mocks.getQuizResult, setQuestionGradeOverride: mocks.setQuestionGradeOverride }))
vi.mock('../services/questionService', () => ({ watchQuestionPairs: mocks.watchQuestionPairs }))
vi.mock('../../classes/services/classService', () => ({ getClass: mocks.getClass }))
vi.mock('../../classes/services/enrollmentService', () => ({ listEnrollments: mocks.listEnrollments }))

const now = Timestamp.fromMillis(1000)
const quiz = { id: 'quiz-1', ownerId: 'teacher', ownerName: 'Teacher', classId: 'class-1', title: 'Practice', description: '', tags: [], mode: 'quiz', status: 'published', questionCount: 1, createdAt: now, updatedAt: now, publishedAt: now, settings: { answerReveal: 'after_each', participation: { type: 'individual' }, scoreVisibility: 'after_release', scoresReleased: false, timeLimitMinutes: null, attemptsAllowed: 1, shuffleQuestions: false, shuffleOptions: false } }
const question: SavedQuestion = { id: 'q1', question: { type: 'identification', prompt: 'Name a planet', points: 2, order: 0 }, answerKey: { type: 'identification', acceptedAnswers: ['Mars'], explanation: 'Mars is red.', caseSensitive: false } }
const attempt: AttemptResult = { id: 'attempt-1', userId: 'student', userName: 'Sam Student', attemptNumber: 1, status: 'submitted', answers: { q1: 'Mars' }, questionOrder: ['q1'], optionOrder: {}, startedAt: now, submittedAt: now, timeSpentSeconds: 28, result: { userId: 'student', score: 2, maxScore: 2, perQuestion: { q1: { correct: true, pointsAwarded: 2, overridden: false } }, gradedAt: now } }

function renderPage() {
  return render(<MemoryRouter initialEntries={['/instructor/quizzes/quiz-1/results']}><Routes><Route path="/instructor/quizzes/:quizId/results" element={<QuizResultsPage />} /></Routes></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getQuiz.mockResolvedValue(quiz)
  mocks.listQuizAttempts.mockResolvedValue([attempt])
  mocks.getQuizResult.mockResolvedValue(attempt.result)
  mocks.watchQuestionPairs.mockImplementation((_id: string, onChange: (items: typeof question[]) => void) => { onChange([question]); return vi.fn() })
  mocks.getClass.mockResolvedValue({ id: 'class-1', name: 'Science, North' })
  mocks.listEnrollments.mockResolvedValue([{ id: 'enrollment-1', classId: 'class-1', ownerId: 'teacher', uid: 'student', studentName: 'Sam Student', status: 'active', joinedAt: now }])
  mocks.updateQuiz.mockResolvedValue(undefined)
  mocks.setQuestionGradeOverride.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('instructor quiz results page', () => {
  it('shows class label, submission stats and attempt detail', async () => {
    renderPage()
    expect(await screen.findByText('Class · Science, North')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Submissions' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Review$/ }))
    expect(await screen.findByText('Student answer')).toBeInTheDocument()
    expect(screen.getByText('Correct answer')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveTextContent('Student answerMars')
    expect(screen.getByRole('dialog')).toHaveTextContent('Correct answerMars')
  })

  it('confirms score release before updating settings', async () => {
    renderPage()
    const release = await screen.findByRole('switch', { name: /release scores to students/i })
    fireEvent.click(release)
    expect(await screen.findByRole('dialog', { name: 'Release scores to students?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Release scores' }))
    await waitFor(() => expect(mocks.updateQuiz).toHaveBeenCalledWith('quiz-1', { settings: { ...quiz.settings, scoresReleased: true } }))
  })

  it('rejects an instructor who does not own the quiz', async () => {
    mocks.getQuiz.mockResolvedValue({ ...quiz, ownerId: 'someone-else' })
    renderPage()
    expect(await screen.findByText('These results are only available to the quiz owner.')).toBeInTheDocument()
    expect(mocks.listQuizAttempts).not.toHaveBeenCalled()
  })
})

describe('attempt detail component', () => {
  it('shows the student response and exposes reversible typed-answer grading', async () => {
    render(<AttemptDetail quizId="quiz-1" attempt={attempt} questions={[question]} ungraded={false} onGradeChanged={vi.fn()} />)
    expect(screen.getByText('Student answer')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mark correct' }))
    await waitFor(() => expect(mocks.setQuestionGradeOverride).toHaveBeenCalledWith('quiz-1', 'attempt-1', 'q1', 2))
  })
})
