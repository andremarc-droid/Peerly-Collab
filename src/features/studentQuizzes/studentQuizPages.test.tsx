import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'
import { QuizIntroPage } from './QuizIntroPage'
import { QuizTakingPage } from './QuizTakingPage'
import { QuizResultPage } from './QuizResultPage'
import { defaultQuizSettings } from '../quizzes/schemas/settings'
import type { Quiz, QuizAttempt, QuizResult } from '../quizzes/types'
import { getQuiz } from '../quizzes/services/quizService'
import { getAttempt, listUserAttempts, startAttempt, autosaveAnswers, saveQuestionTimer, submitAttempt } from '../quizzes/services/attemptService'
import { getQuizResult } from '../quizzes/services/resultService'
import { getQuestionWithKey, listQuestions } from '../quizzes/services/questionService'
import { listMyEnrollments } from '../classes/services/joinService'
import type { EnrollmentWithId } from '../classes/types'

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', MockResizeObserver)

vi.mock('../../app/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
const { signedInUser } = vi.hoisted(() => ({ signedInUser: { uid: 'student-1', email: 'student@example.test', displayName: 'Student' } }))
vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ user: signedInUser, profile: { name: 'Student' } }) }))
const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }))
vi.mock('../../shared/ui/useToast', () => ({ useToast: () => ({ showToast }) }))
vi.mock('../quizzes/services/quizService', () => ({ getQuiz: vi.fn() }))
vi.mock('../quizzes/services/attemptService', () => ({ getAttempt: vi.fn(), listUserAttempts: vi.fn(), startAttempt: vi.fn(), autosaveAnswers: vi.fn(), saveQuestionTimer: vi.fn(), submitAttempt: vi.fn() }))
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
  vi.mocked(saveQuestionTimer).mockResolvedValue()
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
    await user.click(screen.getByRole('button', { name: 'Submit answer' }))
    await user.click(await screen.findByRole('button', { name: 'Review and submit' }))
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
    expect(showToast).toHaveBeenCalledWith('info', 'Time had run out, so your quiz was submitted.')
  })

  it('displays a calm late submission note on the student result page', async () => {
    vi.mocked(getQuiz).mockResolvedValue({ ...quiz, settings: { ...quiz.settings, timeLimitMinutes: 1 } })
    vi.mocked(getAttempt).mockResolvedValue({ ...submittedAttempt, startedAt: Timestamp.fromMillis(1_000_000), submittedAt: Timestamp.fromMillis(1_000_000 + 300_000) })
    renderRoute('/student/quizzes/quiz-1/attempts/attempt-1/result', <QuizResultPage />)
    expect(await screen.findByText('Submitted after the time limit. Your instructor may review this.')).toBeInTheDocument()
  })

  it('displays option text instead of raw option id on the student result page', async () => {
    vi.mocked(getQuiz).mockResolvedValue(quiz)
    vi.mocked(getAttempt).mockResolvedValue({ ...submittedAttempt, answers: { q1: 'correct' } })
    renderRoute('/student/quizzes/quiz-1/attempts/attempt-1/result', <QuizResultPage />)
    expect(await screen.findByText(/Your answer:/)).toBeInTheDocument()
    expect(screen.getAllByText('Second option').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('correct')).not.toBeInTheDocument()
  })

  it('shows retry and back to catalog actions when submission fails', async () => {
    vi.mocked(submitAttempt).mockRejectedValueOnce(new Error('Network offline'))
    const user = userEvent.setup()
    renderRoute('/student/quizzes/quiz-1/attempts/attempt-1', <QuizTakingPage />)
    await screen.findByText('Which option is correct?')
    await user.click(screen.getByRole('button', { name: 'Submit answer' }))
    await user.click(await screen.findByRole('button', { name: 'Review and submit' }))
    await user.click(await screen.findByRole('button', { name: 'Continue to submit' }))
    await user.click(screen.getByRole('button', { name: 'Submit quiz' }))
    expect(await screen.findByRole('button', { name: 'Retry submission' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to catalog' })).toBeInTheDocument()
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

  it('arrow keys inside text input do not jump between questions', async () => {
    const identQuestion1 = { id: 'q1', order: 0, type: 'identification' as const, prompt: 'What is H2O?', points: 1 }
    const identQuestion2 = { id: 'q2', order: 1, type: 'multiple_choice' as const, prompt: 'Second question', points: 1, options: [{ id: 'opt1', text: 'Option 1' }, { id: 'opt2', text: 'Option 2' }] }
    const identQuiz: Quiz & { id: string } = { ...quiz, id: 'quiz-ident', questionCount: 2 }
    const identAttempt: QuizAttempt & { id: string } = {
      ...attempt,
      id: 'attempt-ident',
      questionOrder: ['q1', 'q2'],
      optionOrder: { q2: ['opt1', 'opt2'] },
    }

    vi.mocked(getQuiz).mockResolvedValue(identQuiz)
    vi.mocked(listQuestions).mockResolvedValue([identQuestion1, identQuestion2])
    vi.mocked(getAttempt).mockResolvedValue(identAttempt)

    renderRoute('/student/quizzes/quiz-ident/attempts/attempt-ident', <QuizTakingPage />)

    const input = await screen.findByLabelText('Your answer')
    expect(input).toBeInTheDocument()
    expect(screen.getByText('What is H2O?')).toBeInTheDocument()

    // Press ArrowRight inside input
    fireEvent.keyDown(input, { key: 'ArrowRight', code: 'ArrowRight' })
    // Must remain on question 1
    expect(screen.getByText('What is H2O?')).toBeInTheDocument()
    expect(screen.queryByText('Second question')).not.toBeInTheDocument()

    // Press ArrowLeft inside input
    fireEvent.keyDown(input, { key: 'ArrowLeft', code: 'ArrowLeft' })
    expect(screen.getByText('What is H2O?')).toBeInTheDocument()
  })

  it('ArrowRight follows Next button rules in after_each reveal mode', async () => {
    const multiQuestion1 = { id: 'q1', order: 0, type: 'multiple_choice' as const, prompt: 'First question', points: 1, options: [{ id: 'opt1', text: 'Alpha' }, { id: 'opt1b', text: 'Beta' }] }
    const multiQuestion2 = { id: 'q2', order: 1, type: 'multiple_choice' as const, prompt: 'Second question', points: 1, options: [{ id: 'opt2', text: 'Gamma' }, { id: 'opt2b', text: 'Delta' }] }
    const revealQuiz: Quiz & { id: string } = {
      ...quiz,
      id: 'quiz-reveal-each',
      questionCount: 2,
      settings: { ...quiz.settings, answerReveal: 'after_each' },
    }
    const revealAttempt: QuizAttempt & { id: string } = {
      ...attempt,
      id: 'attempt-reveal-each',
      questionOrder: ['q1', 'q2'],
      optionOrder: { q1: ['opt1', 'opt1b'], q2: ['opt2', 'opt2b'] },
    }

    vi.mocked(getQuiz).mockResolvedValue(revealQuiz)
    vi.mocked(listQuestions).mockResolvedValue([multiQuestion1, multiQuestion2])
    vi.mocked(getAttempt).mockResolvedValue(revealAttempt)
    vi.mocked(getQuestionWithKey).mockResolvedValue({
      id: 'q1',
      question: multiQuestion1,
      answerKey: { type: 'choice', correctOptionId: 'opt1', explanation: 'Alpha is correct', caseSensitive: false },
    })

    const { container } = renderRoute('/student/quizzes/quiz-reveal-each/attempts/attempt-reveal-each', <QuizTakingPage />)

    expect(await screen.findByText('First question')).toBeInTheDocument()

    // 1. ArrowRight before checking must NOT advance
    const card = container.querySelector('.quiz-taking__card')!
    fireEvent.keyDown(card, { key: 'ArrowRight', code: 'ArrowRight' })
    expect(screen.getByText('First question')).toBeInTheDocument()
    expect(screen.queryByText('Second question')).not.toBeInTheDocument()

    // 2. Select option and submit answer to check it
    const radio = screen.getByRole('radio', { name: /Alpha/i })
    await userEvent.click(radio)
    const submitBtn = screen.getByRole('button', { name: /Submit answer/i })
    await userEvent.click(submitBtn)

    expect(await screen.findByText('Alpha is correct')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Submit answer/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Next$/i })).toBeInTheDocument()

    // 3. ArrowRight after checking SHOULD advance
    fireEvent.keyDown(card, { key: 'ArrowRight', code: 'ArrowRight' })
    expect(await screen.findByText('Second question')).toBeInTheDocument()
  })

  it('restores persisted question index from sessionStorage and skips redundant autosave on initial load', async () => {
    const multiQuestion1 = { id: 'q1', order: 0, type: 'multiple_choice' as const, prompt: 'First question', points: 1, options: [{ id: 'opt1', text: 'Alpha' }, { id: 'opt1b', text: 'Beta' }] }
    const multiQuestion2 = { id: 'q2', order: 1, type: 'multiple_choice' as const, prompt: 'Second question', points: 1, options: [{ id: 'opt2', text: 'Gamma' }, { id: 'opt2b', text: 'Delta' }] }
    const multiQuiz: Quiz & { id: string } = { ...quiz, questionCount: 2 }
    const multiAttempt: QuizAttempt & { id: string } = {
      ...attempt,
      id: 'attempt-persisted-index',
      answers: { q1: 'opt1' },
      questionOrder: ['q1', 'q2'],
    }
    vi.mocked(getQuiz).mockResolvedValue(multiQuiz)
    vi.mocked(listQuestions).mockResolvedValue([multiQuestion1, multiQuestion2])
    vi.mocked(getAttempt).mockResolvedValue(multiAttempt)
    vi.mocked(autosaveAnswers).mockClear()

    sessionStorage.setItem('peerly:questionIndex:attempt-persisted-index', '1')

    const view = renderRoute('/student/quizzes/quiz-1/attempts/attempt-persisted-index', <QuizTakingPage />)

    // Directly renders question index 1 (Second question)
    expect(await screen.findByText('Second question')).toBeInTheDocument()

    // No redundant autosave write was made for unchanged answers
    expect(autosaveAnswers).not.toHaveBeenCalled()

    // Changing answer and unmounting flushes pending answers
    const radio = screen.getByRole('radio', { name: /Gamma/i })
    await userEvent.click(radio)
    expect(autosaveAnswers).not.toHaveBeenCalled()

    view.unmount()
    expect(autosaveAnswers).toHaveBeenCalledWith('quiz-1', 'attempt-persisted-index', expect.objectContaining({ q2: 'opt2' }))
  })

  describe('per-question timer', () => {
    const timedQuestion = (id: string, order: number, prompt: string) => ({
      id, order, type: 'multiple_choice' as const, prompt, points: 1,
      options: [{ id: `${id}a`, text: `${prompt} A` }, { id: `${id}b`, text: `${prompt} B` }],
    })
    const timedQuiz: Quiz & { id: string } = {
      ...quiz, id: 'quiz-timed', questionCount: 3,
      settings: { ...quiz.settings, answerReveal: 'never', timeLimitMinutes: 1, timeLimitSeconds: 60 },
    }
    const timedAttempt = (overrides: Partial<QuizAttempt> = {}): QuizAttempt & { id: string } => ({
      ...attempt, id: 'attempt-timed', questionOrder: ['q1', 'q2', 'q3'],
      optionOrder: { q1: ['q1a', 'q1b'], q2: ['q2a', 'q2b'], q3: ['q3a', 'q3b'] }, ...overrides,
    })
    const route = '/student/quizzes/quiz-timed/attempts/attempt-timed'

    beforeEach(() => {
      vi.mocked(getQuiz).mockResolvedValue(timedQuiz)
      vi.mocked(listQuestions).mockResolvedValue([timedQuestion('q1', 0, 'First'), timedQuestion('q2', 1, 'Second'), timedQuestion('q3', 2, 'Third')])
      vi.mocked(saveQuestionTimer).mockClear()
      vi.mocked(submitAttempt).mockClear()
      showToast.mockClear()
    })

    it('shows a live countdown for the current question and only moves forward', async () => {
      const user = userEvent.setup()
      vi.mocked(getAttempt).mockResolvedValue(timedAttempt({ startedAt: Timestamp.fromMillis(Date.now()) }))
      renderRoute(route, <QuizTakingPage />)
      expect(await screen.findByText('First')).toBeInTheDocument()
      expect(screen.getByRole('timer', { name: 'Time left on this question' })).toHaveTextContent(/^(1:00|0:5\d)$/)
      expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument()
      expect(screen.queryByRole('navigation', { name: 'Question navigator' })).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Next' }))
      expect(await screen.findByText('Second')).toBeInTheDocument()
      // The next question starts again with its full time, and the new clock is saved.
      expect(screen.getByRole('timer', { name: 'Time left on this question' })).toHaveTextContent(/^(1:00|0:5\d)$/)
      expect(saveQuestionTimer).toHaveBeenCalledWith('quiz-timed', 'attempt-timed', 1, expect.any(Number))

      // Earlier questions cannot be reopened, not even with the keyboard.
      fireEvent.keyDown(document.querySelector('.quiz-taking__card')!, { key: 'ArrowLeft', code: 'ArrowLeft' })
      expect(screen.getByText('Second')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument()
    })

    it('offers Review and submit only on the last question', async () => {
      const user = userEvent.setup()
      vi.mocked(getAttempt).mockResolvedValue(timedAttempt({ startedAt: Timestamp.fromMillis(Date.now()) }))
      renderRoute(route, <QuizTakingPage />)
      await screen.findByText('First')
      expect(screen.queryByRole('button', { name: 'Review and submit' })).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Next' }))
      await screen.findByText('Second')
      expect(screen.queryByRole('button', { name: 'Review and submit' })).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Next' }))
      await screen.findByText('Third')
      expect(screen.getByRole('button', { name: 'Review and submit' })).toBeInTheDocument()
    })

    it('resumes on the saved question with the saved clock after a refresh', async () => {
      const now = Date.now()
      vi.mocked(getAttempt).mockResolvedValue(timedAttempt({ startedAt: Timestamp.fromMillis(now - 100_000), questionTimer: { index: 1, startedAtMs: now - 20_000 } }))
      renderRoute(route, <QuizTakingPage />)
      expect(await screen.findByText('Second')).toBeInTheDocument()
      expect(screen.getByRole('timer', { name: 'Time left on this question' })).toHaveTextContent(/^0:(3|4)\d$/)
    })

    it('skips questions whose time ran out while the student was away', async () => {
      vi.mocked(getAttempt).mockResolvedValue(timedAttempt({ startedAt: Timestamp.fromMillis(Date.now() - 130_000) }))
      renderRoute(route, <QuizTakingPage />)
      expect(await screen.findByText('Third')).toBeInTheDocument()
      expect(submitAttempt).not.toHaveBeenCalled()
    })

    it('submits automatically once the last question runs out of time', async () => {
      vi.mocked(getAttempt).mockResolvedValue(timedAttempt({ startedAt: Timestamp.fromMillis(Date.now() - 190_000) }))
      renderRoute(route, <QuizTakingPage />)
      await waitFor(() => expect(submitAttempt).toHaveBeenCalled(), { timeout: 3000 })
      expect(showToast).toHaveBeenCalledWith('info', 'Time had run out, so your quiz was submitted.')
    })

    it('submits automatically at the deadline even when questions are not timed', async () => {
      vi.mocked(getQuiz).mockResolvedValue({ ...quiz, settings: { ...quiz.settings, timeLimitMinutes: null, timeLimitSeconds: null, closesAt: Timestamp.fromMillis(Date.now() - 1_000) } })
      vi.mocked(getAttempt).mockResolvedValue(attempt)
      renderRoute('/student/quizzes/quiz-1/attempts/attempt-1', <QuizTakingPage />)
      await waitFor(() => expect(submitAttempt).toHaveBeenCalled(), { timeout: 3000 })
      expect(showToast).toHaveBeenCalledWith('info', 'The deadline passed, so your quiz was submitted.')
    })
  })
})

