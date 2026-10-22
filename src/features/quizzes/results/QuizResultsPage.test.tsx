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
  getQuiz: vi.fn(), listQuizAttempts: vi.fn(), listResults: vi.fn(), getQuizResult: vi.fn(), watchQuestionPairs: vi.fn(), getClass: vi.fn(), listEnrollments: vi.fn(),
  updateQuiz: vi.fn(), setQuestionGradeOverride: vi.fn(), toast: vi.fn(),
}))

vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'teacher', email: 'teacher@test.dev' } }) }))
vi.mock('../../../app/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('../../../shared/ui/useToast', () => ({ useToast: () => ({ showToast: mocks.toast }) }))
vi.mock('../services/quizService', () => ({ getQuiz: mocks.getQuiz, updateQuiz: mocks.updateQuiz }))
vi.mock('../services/attemptService', () => ({ listQuizAttempts: mocks.listQuizAttempts }))
vi.mock('../services/resultService', () => ({ getQuizResult: mocks.getQuizResult, listResults: mocks.listResults, setQuestionGradeOverride: mocks.setQuestionGradeOverride }))
vi.mock('../services/questionService', () => ({ watchQuestionPairs: mocks.watchQuestionPairs }))
vi.mock('../../classes/services/classService', () => ({ getClass: mocks.getClass }))
vi.mock('../../classes/services/enrollmentService', () => ({ listEnrollments: mocks.listEnrollments }))
vi.mock('../../canvas/components/CanvasBoard', () => ({
  default: () => <div data-testid="canvas-board" />,
}))

const now = Timestamp.fromMillis(1000)
const quiz = { id: 'quiz-1', ownerId: 'teacher', ownerName: 'Teacher', classId: 'class-1', title: 'Practice', description: '', tags: [], mode: 'quiz', status: 'published', questionCount: 1, createdAt: now, updatedAt: now, publishedAt: now, settings: { answerReveal: 'after_each', participation: { type: 'individual' }, scoreVisibility: 'after_release', scoresReleased: false, timeLimitMinutes: null, attemptsAllowed: 1, shuffleQuestions: false, shuffleOptions: false } }
const question: SavedQuestion = { id: 'q1', question: { type: 'identification', prompt: 'Name a planet', points: 2, order: 0 }, answerKey: { type: 'identification', acceptedAnswers: ['Mars'], explanation: 'Mars is red.', caseSensitive: false } }
const attempt: AttemptResult = { id: 'attempt-1', userId: 'student', userName: 'Sam Student', attemptNumber: 1, status: 'submitted', answers: { q1: 'Mars' }, questionOrder: ['q1'], optionOrder: {}, startedAt: now, submittedAt: Timestamp.fromMillis(71_000), timeSpentSeconds: 28, result: { userId: 'student', score: 2, maxScore: 2, perQuestion: { q1: { correct: true, pointsAwarded: 2, overridden: false } }, gradedAt: now } }

function renderPage() {
  return render(<MemoryRouter initialEntries={['/instructor/quizzes/quiz-1/results']}><Routes><Route path="/instructor/quizzes/:quizId/results" element={<QuizResultsPage />} /></Routes></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getQuiz.mockResolvedValue(quiz)
  mocks.listQuizAttempts.mockResolvedValue([attempt])
  mocks.listResults.mockResolvedValue(attempt.result ? [{ ...attempt.result, id: attempt.id }] : [])
  mocks.getQuizResult.mockResolvedValue(attempt.result)
  mocks.watchQuestionPairs.mockImplementation((_id: string, onChange: (items: typeof question[]) => void) => { onChange([question]); return vi.fn() })
  mocks.getClass.mockResolvedValue({ id: 'class-1', name: 'Science, North' })
  mocks.listEnrollments.mockResolvedValue([{ id: 'enrollment-1', classId: 'class-1', ownerId: 'teacher', uid: 'student', studentName: 'Sam Student', status: 'active', joinedAt: now }])
  mocks.updateQuiz.mockResolvedValue(undefined)
  mocks.setQuestionGradeOverride.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('instructor quiz results page', () => {
  it('shows class label, submission stats and attempt detail with computed duration', async () => {
    renderPage()
    expect(await screen.findByText('Class · Science, North')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Submissions' })).toBeInTheDocument()
    expect(mocks.listResults).toHaveBeenCalledWith('quiz-1')
    expect(screen.getByText('1m 10s')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Review$/ }))
    expect(await screen.findByText('Student answer')).toBeInTheDocument()
    expect(screen.getByText('Correct answer')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveTextContent('Student answerMars')
    expect(screen.getByRole('dialog')).toHaveTextContent('Correct answerMars')
    expect(screen.getByText(/70 seconds/)).toBeInTheDocument()
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

  it('displays Late badge, summary tile count, and Late by M min for late attempts', async () => {
    const lateAttempt: AttemptResult = {
      ...attempt,
      id: 'attempt-late',
      startedAt: Timestamp.fromMillis(1_000_000),
      submittedAt: Timestamp.fromMillis(1_000_000 + 900_000),
    }
    mocks.getQuiz.mockResolvedValue({ ...quiz, settings: { ...quiz.settings, timeLimitMinutes: 10 } })
    mocks.listQuizAttempts.mockResolvedValue([lateAttempt])
    mocks.listResults.mockResolvedValue(lateAttempt.result ? [{ ...lateAttempt.result, id: lateAttempt.id }] : [])
    mocks.getQuizResult.mockResolvedValue(lateAttempt.result)
    renderPage()
    expect(await screen.findByText('Late submissions')).toBeInTheDocument()
    expect(screen.getByText('Late by 5 min')).toBeInTheDocument()
    expect(screen.getAllByText('Late').length).toBeGreaterThanOrEqual(1)
  })
})

describe('attempt detail component', () => {
  it('shows the student response and exposes reversible typed-answer grading', async () => {
    render(<AttemptDetail quizId="quiz-1" attempt={attempt} questions={[question]} ungraded={false} onGradeChanged={vi.fn()} />)
    expect(screen.getByText('Student answer')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mark correct' }))
    await waitFor(() => expect(mocks.setQuestionGradeOverride).toHaveBeenCalledWith('quiz-1', 'attempt-1', 'q1', 2))
  })

  it('renders option text instead of raw option id for multiple choice questions', () => {
    const choiceQuestion: SavedQuestion = {
      id: 'q2',
      question: {
        type: 'multiple_choice',
        prompt: 'What does API stand for?',
        points: 1,
        order: 0,
        options: [
          { id: 'opt-1', text: 'Application Programming Interface' },
          { id: 'opt-2', text: 'Apple Pie Inside' },
        ],
      },
      answerKey: {
        type: 'choice',
        correctOptionId: 'opt-1',
        explanation: 'API is Application Programming Interface',
        caseSensitive: false,
      },
    }
    const choiceAttempt: AttemptResult = {
      ...attempt,
      answers: { q2: 'opt-1' },
      result: {
        userId: 'student',
        score: 1,
        maxScore: 1,
        perQuestion: { q2: { correct: true, pointsAwarded: 1, overridden: false } },
        gradedAt: now,
      },
    }
    render(<AttemptDetail quizId="quiz-1" attempt={choiceAttempt} questions={[choiceQuestion]} ungraded={false} onGradeChanged={vi.fn()} />)
    expect(screen.getAllByText('Application Programming Interface').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('opt-1')).not.toBeInTheDocument()
  })

  it('renders team badge and team board submission title for team blank canvas attempts', () => {
    const blankQuestion: SavedQuestion = {
      id: 'board',
      question: {
        type: 'canvas',
        prompt: 'Draw diagram',
        points: 20,
        order: 0,
        cards: [],
        showRubricToStudents: true,
        maxCards: 20,
        maxConnections: 40,
        allowedCardTypes: ['note', 'paragraph', 'link'],
      },
      answerKey: null,
    }
    const teamBlankAttempt: AttemptResult = {
      ...attempt,
      teamId: 'team-blue',
      teamName: 'Team Blue',
      answers: { board: { cards: [{ id: 'c1', type: 'note', content: 'Node 1', position: { x: 0, y: 0 } }], connections: [] } },
      result: {
        userId: 'student',
        score: 0,
        maxScore: 20,
        perQuestion: {},
        gradedAt: now,
        reviewStatus: 'pending',
      },
    }
    render(
      <AttemptDetail
        quizId="quiz-1"
        attempt={teamBlankAttempt}
        questions={[blankQuestion]}
        ungraded={false}
        isBlankCanvas={true}
        allAttempts={[teamBlankAttempt]}
        onGradeChanged={vi.fn()}
      />,
    )
    expect(screen.getByText('Team: Team Blue')).toBeInTheDocument()
    expect(screen.getByText('Team board submission · Team Blue')).toBeInTheDocument()
  })
})
