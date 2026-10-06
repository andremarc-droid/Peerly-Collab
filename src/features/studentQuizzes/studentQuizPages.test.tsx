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
import { getAttempt, listUserAttempts, startAttempt, autosaveAnswers, submitAttempt } from '../quizzes/services/attemptService'
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
    expect(showToast).toHaveBeenCalledWith('info', 'Time had run out, so your quiz was submitted.')
  })

  it('displays a calm late submission note on the student result page', async () => {
    vi.mocked(getQuiz).mockResolvedValue({ ...quiz, settings: { ...quiz.settings, timeLimitMinutes: 1 } })
    vi.mocked(getAttempt).mockResolvedValue({ ...submittedAttempt, startedAt: Timestamp.fromMillis(1_000_000), submittedAt: Timestamp.fromMillis(1_000_000 + 300_000) })
    renderRoute('/student/quizzes/quiz-1/attempts/attempt-1/result', <QuizResultPage />)
    expect(await screen.findByText('Submitted after the time limit. Your instructor may review this.')).toBeInTheDocument()
  })

  it('shows retry and back to catalog actions when submission fails', async () => {
    vi.mocked(submitAttempt).mockRejectedValueOnce(new Error('Network offline'))
    const user = userEvent.setup()
    renderRoute('/student/quizzes/quiz-1/attempts/attempt-1', <QuizTakingPage />)
    await screen.findByText('Which option is correct?')
    await user.click(screen.getByRole('button', { name: 'Review and submit' }))
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

  it('canvas intro page displays activity, card count, and penalty rule without key info', async () => {
    const canvasQuiz: Quiz & { id: string } = {
      ...quiz,
      id: 'quiz-canvas-1',
      mode: 'canvas',
      title: 'Canvas Practice Test',
    }
    const canvasQuestion = {
      id: 'board',
      type: 'canvas' as const,
      order: 0,
      prompt: 'Link related cellular respiration stages.',
      points: 100,
      layoutMode: 'scattered' as const,
      directed: true,
      wrongPenalty: 'half' as const,
      cards: [
        { id: 'c1', type: 'note' as const, title: 'Glycolysis', content: 'Cytoplasm pathway', position: { x: 0, y: 0 } },
        { id: 'c2', type: 'note' as const, title: 'Krebs Cycle', content: 'Matrix pathway', position: { x: 100, y: 0 } },
      ],
    }

    vi.mocked(getQuiz).mockResolvedValue(canvasQuiz)
    vi.mocked(listQuestions).mockResolvedValue([canvasQuestion])
    vi.mocked(listUserAttempts).mockResolvedValue([])

    renderRoute('/student/quizzes/quiz-canvas-1', <QuizIntroPage />)

    expect(await screen.findByText('Connect the cards that belong together.')).toBeInTheDocument()
    expect(screen.getByText('2 cards on the board.')).toBeInTheDocument()
    expect(screen.getByText('Half penalty: incorrect connections deduct half of an average connection’s points.')).toBeInTheDocument()
    expect(screen.getByText('CANVAS PRACTICE')).toBeInTheDocument()
    // No answer key info revealed
    expect(screen.queryByText(/connection/i)).not.toHaveTextContent(/answer key/i)
  })

  it('canvas taking page renders CanvasPlayPage and treats empty board as unanswered in review', async () => {
    const user = userEvent.setup()
    const canvasQuiz: Quiz & { id: string } = {
      ...quiz,
      id: 'quiz-canvas-1',
      mode: 'canvas',
    }
    const canvasQuestion = {
      id: 'board',
      type: 'canvas' as const,
      order: 0,
      prompt: 'Link related cellular respiration stages.',
      points: 100,
      layoutMode: 'scattered' as const,
      directed: true,
      wrongPenalty: 'half' as const,
      cards: [
        { id: 'c1', type: 'note' as const, title: 'Glycolysis', content: 'Cytoplasm pathway', position: { x: 0, y: 0 } },
        { id: 'c2', type: 'note' as const, title: 'Krebs Cycle', content: 'Matrix pathway', position: { x: 100, y: 0 } },
      ],
    }
    const canvasAttempt: QuizAttempt & { id: string } = {
      ...attempt,
      id: 'attempt-c1',
      answers: {},
      questionOrder: ['board'],
      optionOrder: {},
    }

    vi.mocked(getQuiz).mockResolvedValue(canvasQuiz)
    vi.mocked(listQuestions).mockResolvedValue([canvasQuestion])
    vi.mocked(getAttempt).mockResolvedValue(canvasAttempt)

    renderRoute('/student/quizzes/quiz-canvas-1/attempts/attempt-c1', <QuizTakingPage />)

    // Verify CanvasPlayPage is rendered with connections counter
    expect(await screen.findByText('Connections (0 of 80)')).toBeInTheDocument()
    expect(screen.getByText('Link related cellular respiration stages.')).toBeInTheDocument()

    // Click Review and submit -> empty board counts as unanswered (0 of 1 answered, 1 unanswered)
    await user.click(screen.getByRole('button', { name: 'Review and submit' }))
    expect(await screen.findByRole('dialog', { name: 'Review your answers' })).toBeInTheDocument()
    expect(screen.getByText('0 of 1 answered. 1 unanswered.')).toBeInTheDocument()
  })

  it('quiz taking page ignores Enter, arrow keys, and number keys when focus is inside canvas board', async () => {
    const canvasQuiz: Quiz & { id: string } = {
      ...quiz,
      id: 'quiz-canvas-nav',
      mode: 'canvas',
    }
    const canvasQuestion1 = {
      id: 'board-1',
      type: 'canvas' as const,
      order: 0,
      prompt: 'Board question 1',
      points: 100,
      layoutMode: 'scattered' as const,
      directed: true,
      wrongPenalty: 'half' as const,
      cards: [
        { id: 'c1', type: 'note' as const, title: 'Card 1', content: 'Card content', position: { x: 0, y: 0 } },
        { id: 'c2', type: 'note' as const, title: 'Card 2', content: 'Card content 2', position: { x: 100, y: 0 } },
      ],
    }
    const canvasQuestion2 = {
      id: 'board-2',
      type: 'canvas' as const,
      order: 1,
      prompt: 'Board question 2',
      points: 100,
      layoutMode: 'scattered' as const,
      directed: true,
      wrongPenalty: 'half' as const,
      cards: [
        { id: 'c3', type: 'note' as const, title: 'Card 3', content: 'Card 3', position: { x: 0, y: 0 } },
      ],
    }
    const canvasAttempt: QuizAttempt & { id: string } = {
      ...attempt,
      id: 'att-canvas-nav',
      answers: {},
      questionOrder: ['board-1', 'board-2'],
      optionOrder: {},
    }

    vi.mocked(getQuiz).mockResolvedValue(canvasQuiz)
    vi.mocked(listQuestions).mockResolvedValue([canvasQuestion1, canvasQuestion2])
    vi.mocked(getAttempt).mockResolvedValue(canvasAttempt)

    renderRoute('/student/quizzes/quiz-canvas-nav/attempts/att-canvas-nav', <QuizTakingPage />)

    // Wait for the board cards to render
    const cardArticle = await screen.findByRole('article', { name: /Card 1/i })
    expect(cardArticle).toBeInTheDocument()

    // Focus the card
    cardArticle.focus()

    // 1. Pressing Enter on the card does NOT open the review dialog
    fireEvent.keyDown(cardArticle, { key: 'Enter', code: 'Enter' })
    expect(screen.queryByRole('dialog', { name: 'Review your answers' })).not.toBeInTheDocument()

    // 2. Pressing ArrowRight does NOT change question (stays on Question 1)
    fireEvent.keyDown(cardArticle, { key: 'ArrowRight', code: 'ArrowRight' })
    expect(screen.getByText('Question 1 · 100 points')).toBeInTheDocument()
    expect(screen.getByText('Board question 1')).toBeInTheDocument()

    // 3. Pressing number key '1' does NOT throw or change question
    fireEvent.keyDown(cardArticle, { key: '1', code: 'Digit1' })
    expect(screen.getByText('Question 1 · 100 points')).toBeInTheDocument()

    // 4. Pressing ArrowLeft does NOT navigate backwards either
    fireEvent.keyDown(cardArticle, { key: 'ArrowLeft', code: 'ArrowLeft' })
    expect(screen.getByText('Question 1 · 100 points')).toBeInTheDocument()
  })

  it('canvas result page renders review board and diff list with icons and text labels', async () => {
    const canvasQuiz: Quiz & { id: string } = {
      ...quiz,
      id: 'quiz-canvas-1',
      mode: 'canvas',
      settings: { ...quiz.settings, answerReveal: 'after_submit', scoreVisibility: 'immediate' },
    }
    const canvasQuestion = {
      id: 'board',
      type: 'canvas' as const,
      order: 0,
      prompt: 'Link stages.',
      points: 100,
      layoutMode: 'scattered' as const,
      directed: true,
      wrongPenalty: 'half' as const,
      cards: [
        { id: 'c1', type: 'note' as const, title: 'Glycolysis', content: 'A', position: { x: 0, y: 0 } },
        { id: 'c2', type: 'note' as const, title: 'Krebs', content: 'B', position: { x: 100, y: 0 } },
      ],
    }
    const canvasKey = {
      type: 'canvas' as const,
      explanation: 'Glycolysis connects to Krebs.',
      connections: [{ id: 'c1->c2', from: 'c1', to: 'c2', points: 1 }],
    }
    const canvasAttempt: QuizAttempt & { id: string } = {
      ...submittedAttempt,
      answers: { board: ['c1->c2'] },
      questionOrder: ['board'],
    }
    const canvasResult: QuizResult = {
      userId: 'student-1',
      score: 100,
      maxScore: 100,
      perQuestion: { board: { correct: true, pointsAwarded: 100, overridden: false } },
      gradedAt: Timestamp.now(),
    }

    vi.mocked(getQuiz).mockResolvedValue(canvasQuiz)
    vi.mocked(listQuestions).mockResolvedValue([canvasQuestion])
    vi.mocked(getAttempt).mockResolvedValue(canvasAttempt)
    vi.mocked(getQuizResult).mockResolvedValue(canvasResult)
    vi.mocked(getQuestionWithKey).mockResolvedValue({ id: 'board', question: canvasQuestion, answerKey: canvasKey })

    renderRoute('/student/quizzes/quiz-canvas-1/attempts/attempt-1/result', <QuizResultPage />)

    expect(await screen.findByText('100 / 100 points')).toBeInTheDocument()
    expect(await screen.findByText('Connection breakdown')).toBeInTheDocument()
    expect(screen.getByText('1 correct')).toBeInTheDocument()
    expect(screen.getByText('Glycolysis connects to Krebs.')).toBeInTheDocument()
  })
})
