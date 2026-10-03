import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'
import { QuizIntroPage } from './QuizIntroPage'
import { QuizTakingPage } from './QuizTakingPage'
import { QuizResultPage } from './QuizResultPage'
import { defaultQuizSettings } from '../quizzes/schemas/settings'
import type { Quiz, QuizAttempt, QuizResult } from '../quizzes/types'
import { getQuiz } from '../quizzes/services/quizService'
import { getAttempt, listUserAttempts, startAttempt, autosaveAnswers, submitAttempt } from '../quizzes/services/attemptService'
import { getQuizResult } from '../quizzes/services/resultService'
import { getQuestionWithKey, listQuestions } from '../quizzes/services/questionService'
import { listMyEnrollments } from '../classes/services/joinService'
import type { EnrollmentWithId } from '../classes/types'

vi.mock('../../app/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
const { signedInUser } = vi.hoisted(() => ({ signedInUser: { uid: 'student-1', email: 'student@example.test', displayName: 'Student' } }))
vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ user: signedInUser, profile: { name: 'Student' } }) }))
const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }))
vi.mock('../../shared/ui/useToast', () => ({ useToast: () => ({ showToast }) }))
vi.mock('../quizzes/services/quizService', () => ({ getQuiz: vi.fn() }))
vi.mock('../quizzes/services/attemptService', () => ({ getAttempt: vi.fn(), listUserAttempts: vi.fn(), startAttempt: vi.fn(), autosaveAnswers: vi.fn(), submitAttempt: vi.fn() }))
vi.mock('../quizzes/services/resultService', () => ({ getQuizResult: vi.fn() }))
vi.mock('../quizzes/services/questionService', () => ({ getQuestionWithKey: vi.fn(), listQuestions: vi.fn() }))
vi.mock('../classes/services/joinService', () => ({ listMyEnrollments: vi.fn() }))

const question = { id: 'q1', order: 0, type: 'multiple_choice' as const, prompt: 'Which option is correct?', points: 1, options: [{ id: 'wrong', text: 'First option' }, { id: 'correct', text: 'Second option' }] }
const quiz: Quiz & { id: string } = {
  ownerId: 'teacher', ownerName: 'Instructor', classId: 'class-1', title: 'Fractions', description: 'Practice fractions.', tags: [], mode: 'quiz', status: 'published', questionCount: 1,
  createdAt: Timestamp.fromMillis(1), updatedAt: Timestamp.fromMillis(1), publishedAt: Timestamp.fromMillis(1), settings: { ...defaultQuizSettings('quiz'), timeLimitMinutes: null, attemptsAllowed: 2 }, id: 'quiz-1',
}
const attempt: QuizAttempt & { id: string } = { userId: 'student-1', userName: 'Student', attemptNumber: 1, status: 'in_progress', answers: {}, questionOrder: ['q1'], optionOrder: { q1: ['correct', 'wrong'] }, startedAt: Timestamp.fromMillis(Date.now()), submittedAt: null, timeSpentSeconds: 0, id: 'attempt-1' }
const submittedAttempt = { ...attempt, status: 'submitted' as const, submittedAt: Timestamp.now() }
const result: QuizResult = { userId: 'student-1', score: 1, maxScore: 1, perQuestion: { q1: { correct: true, pointsAwarded: 1, overridden: false } }, gradedAt: Timestamp.now() }
let updateEnrollments: ((items: EnrollmentWithId[]) => void) | null = null

function renderRoute(path: string, element: React.ReactNode) {
  const pageRoute = path.endsWith('/result') ? '/student/quizzes/:quizId/attempts/:attemptId/result' : path.includes('/attempts/') ? '/student/quizzes/:quizId/attempts/:attemptId' : '/student/quizzes/:quizId'
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path={pageRoute} element={element} /><Route path="/student" element={<p>Student catalog</p>} /><Route path="/student/quizzes/:quizId/attempts/:attemptId" element={<p>Taking destination</p>} /><Route path="/student/quizzes/:quizId/attempts/:attemptId/result" element={<p>Result destination</p>} /></Routes></MemoryRouter>)
}

beforeEach(() => {
  updateEnrollments = null
  vi.mocked(getQuiz).mockResolvedValue(quiz)
  vi.mocked(listUserAttempts).mockResolvedValue([])
  vi.mocked(startAttempt).mockResolvedValue('attempt-1')
  vi.mocked(getAttempt).mockResolvedValue(attempt)
  vi.mocked(listQuestions).mockResolvedValue([question])
  vi.mocked(autosaveAnswers).mockResolvedValue()
  vi.mocked(submitAttempt).mockResolvedValue({ attempt: submittedAttempt, result, scoreVisibility: 'immediate' })
  vi.mocked(getQuizResult).mockResolvedValue(result)
  vi.mocked(getQuestionWithKey).mockResolvedValue({ id: 'q1', question, answerKey: { type: 'choice', correctOptionId: 'correct', explanation: 'The second option is correct.', caseSensitive: false } })
  vi.mocked(listMyEnrollments).mockImplementation((_uid, onChange) => {
    onChange([{ id: 'class-1_student-1', classId: 'class-1', ownerId: 'teacher', uid: 'student-1', studentName: 'Student', studentPhotoURL: null, className: 'Math', status: 'active', codeUsed: 'ABC234', joinedAt: Timestamp.now(), updatedAt: Timestamp.now() }])
    return () => undefined
  })
})
afterEach(() => { cleanup(); sessionStorage.clear() })

describe('student quiz pages', () => {
  it('intro explains rules and resumes an existing in-progress attempt', async () => {
    vi.mocked(listUserAttempts).mockResolvedValue([attempt])
    const user = userEvent.setup()
    renderRoute('/student/quizzes/quiz-1', <QuizIntroPage />)
    expect(await screen.findByText(/1 attempt remaining/)).toBeInTheDocument()
    expect(screen.getByText(/You can check each answer and see its explanation/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Resume quiz' }))
    await waitFor(() => expect(screen.getByText('Taking destination')).toBeInTheDocument())
  })

  it('taking page follows saved option order, checks and locks an answer with explanation', async () => {
    const user = userEvent.setup()
    const view = renderRoute('/student/quizzes/quiz-1/attempts/attempt-1', <QuizTakingPage />)
    expect(await screen.findByText('Which option is correct?')).toBeInTheDocument()
    const radios = screen.getAllByRole('radio')
    expect(radios[0]).toHaveAccessibleName(/Second option/)
    await user.click(radios[0])
    await user.keyboard('1')
    expect(radios[0]).toBeChecked()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('status')).toHaveTextContent('Correct')
    expect(screen.getByText('The second option is correct.')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Second option/ })).toBeDisabled()
    vi.mocked(getAttempt).mockResolvedValue({ ...attempt, answers: { q1: 'correct' } })
    view.unmount()
    renderRoute('/student/quizzes/quiz-1/attempts/attempt-1', <QuizTakingPage />)
    expect(await screen.findByRole('radio', { name: /Second option/ })).toBeDisabled()
  })

  it('review screen lists unanswered questions and links back to them before confirmation', async () => {
    const user = userEvent.setup()
    renderRoute('/student/quizzes/quiz-1/attempts/attempt-1', <QuizTakingPage />)
    await screen.findByText('Which option is correct?')
    await user.click(screen.getByRole('button', { name: 'Review and submit' }))
    expect(await screen.findByRole('dialog', { name: 'Review your answers' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Question 1: Which option is correct/ }))
    expect(screen.queryByRole('dialog', { name: 'Review your answers' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Review and submit' }))
    await user.click(await screen.findByRole('button', { name: 'Continue to submit' }))
    expect(await screen.findByRole('dialog', { name: 'Submit your quiz?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Submit quiz' }))
    await waitFor(() => expect(submitAttempt).toHaveBeenCalled())
  })

  it('result hides score until release and never exposes answers when reveal is never', async () => {
    vi.mocked(getQuiz).mockResolvedValue({ ...quiz, settings: { ...quiz.settings, answerReveal: 'never', scoreVisibility: 'after_release', scoresReleased: false } })
    renderRoute('/student/quizzes/quiz-1/attempts/attempt-1/result', <QuizResultPage />)
    expect(await screen.findByText('Submitted, your instructor will share results.')).toBeInTheDocument()
    expect(screen.queryByText('Second option')).not.toBeInTheDocument()
    expect(getQuestionWithKey).not.toHaveBeenCalled()
  })

  it('auto-submits an expired timed attempt and redirects to the result', async () => {
    vi.mocked(getQuiz).mockResolvedValue({ ...quiz, settings: { ...quiz.settings, timeLimitMinutes: 1 } })
    vi.mocked(getAttempt).mockResolvedValue({ ...attempt, startedAt: Timestamp.fromMillis(Date.now() - 61_000) })
    renderRoute('/student/quizzes/quiz-1/attempts/attempt-1', <QuizTakingPage />)
    await waitFor(() => expect(submitAttempt).toHaveBeenCalled(), { timeout: 3000 })
  })

  it('redirects when the enrollment is removed during an attempt', async () => {
    vi.mocked(listMyEnrollments).mockImplementation((_uid, onChange) => {
      updateEnrollments = onChange
      onChange([{ id: 'class-1_student-1', classId: 'class-1', ownerId: 'teacher', uid: 'student-1', studentName: 'Student', studentPhotoURL: null, className: 'Math', status: 'active', codeUsed: 'ABC234', joinedAt: Timestamp.now(), updatedAt: Timestamp.now() }])
      return () => undefined
    })
    renderRoute('/student/quizzes/quiz-1/attempts/attempt-1', <QuizTakingPage />)
    expect(await screen.findByText('Which option is correct?')).toBeInTheDocument()
    updateEnrollments?.([])
    expect(await screen.findByText('Student catalog')).toBeInTheDocument()
  })

  it('explains and disables starting when attempts are exhausted', async () => {
    vi.mocked(listUserAttempts).mockResolvedValue([
      { ...attempt, status: 'submitted', submittedAt: Timestamp.now(), id: 'attempt-1' },
      { ...attempt, status: 'submitted', submittedAt: Timestamp.now(), attemptNumber: 2, id: 'attempt-2' },
    ])
    renderRoute('/student/quizzes/quiz-1', <QuizIntroPage />)
    expect(await screen.findByText(/You have used all attempts allowed for this quiz/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start quiz' })).toBeDisabled()
  })

  it('restores saved answers and option order when resuming after a refresh', async () => {
    vi.mocked(getAttempt).mockResolvedValue({ ...attempt, answers: { q1: 'correct' } })
    renderRoute('/student/quizzes/quiz-1/attempts/attempt-1', <QuizTakingPage />)
    expect(await screen.findByRole('radio', { name: /Second option/ })).toBeChecked()
    expect(screen.getAllByRole('radio')[0]).toHaveAccessibleName(/Second option/)
  })
})
