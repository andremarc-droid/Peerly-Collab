import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Timestamp } from 'firebase/firestore'
import { TeamCanvasPlay } from './TeamCanvasPlay'
import type { QuizRecord } from '../../quizzes/services/quizService'
import type { Team } from '../../quizzes/types/team'
import { listQuestions } from '../../quizzes/services/questionService'
import { submitTeamAttempt, watchTeamBoard } from '../../quizzes/services/teamService'

vi.mock('../../quizzes/services/questionService', () => ({
  listQuestions: vi.fn(),
}))

vi.mock('../../quizzes/services/teamService', () => ({
  saveTeamBoard: vi.fn().mockResolvedValue(undefined),
  watchTeamBoard: vi.fn(),
  submitTeamAttempt: vi.fn().mockResolvedValue({ alreadySubmitted: false, score: null, maxScore: null }),
  describeTeamError: (reason: unknown) => (reason instanceof Error ? reason.message : 'Something went wrong.'),
}))

vi.mock('../BlankCanvasPlayPage', () => ({
  BlankCanvasPlayPage: ({ value, onChange, disabled }: { value?: { cards: unknown[] }; onChange: (val: unknown) => void; disabled?: boolean }) => (
    <div data-testid="blank-canvas-play" data-disabled={disabled ? 'true' : 'false'}>
      <span data-testid="card-count">{value?.cards?.length ?? 0}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange({ cards: [{ id: 'c1', type: 'note', content: 'Card 1', position: { x: 0, y: 0 } }], connections: [] })}
      >
        Add card
      </button>
    </div>
  ),
}))

vi.mock('../CanvasPlayPage', () => ({
  CanvasPlayPage: ({ connections, onChange, disabled }: { connections?: string[]; onChange: (val: string[]) => void; disabled?: boolean }) => (
    <div data-testid="prebuilt-canvas-play" data-disabled={disabled ? 'true' : 'false'}>
      <span data-testid="conn-count">{connections?.length ?? 0}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(['c1->c2'])}
      >
        Connect
      </button>
    </div>
  ),
}))

const baseQuiz: QuizRecord = {
  id: 'quiz-canvas-1',
  ownerId: 'teacher',
  ownerName: 'Instructor',
  classId: 'class-1',
  title: 'Canvas Group Quiz',
  description: '',
  tags: [],
  mode: 'canvas',
  boardKind: 'blank',
  status: 'published',
  questionCount: 1,
  createdAt: Timestamp.fromMillis(1),
  updatedAt: Timestamp.fromMillis(1),
  publishedAt: Timestamp.fromMillis(1),
  settings: {
    answerReveal: 'after_submit',
    participation: { type: 'group', groupSize: 3, answerMode: 'representative', teamFormation: 'self', waitForEveryone: false, questionTimeSec: null },
    scoreVisibility: 'after_release',
    scoresReleased: false,
    timeLimitMinutes: null,
    attemptsAllowed: 1,
    shuffleQuestions: false,
    shuffleOptions: false,
  },
}

const baseTeam: Team = {
  id: 'team-1',
  name: 'Canvas Team',
  memberIds: ['rep-uid', 'teammate-uid'],
  memberNames: { 'rep-uid': 'Alice Rep', 'teammate-uid': 'Bob Mate' },
  representativeId: 'rep-uid',
  code: 'CANVAS',
  studyGroupId: null,
  status: 'in_progress',
  score: null,
  maxScore: null,
}

const mockBoardQuestion = {
  id: 'board',
  type: 'canvas',
  prompt: 'Draw the system architecture',
  points: 20,
  order: 0,
  cards: [],
  showRubricToStudents: true,
  maxCards: 20,
  maxConnections: 40,
  allowedCardTypes: ['note', 'paragraph', 'link'],
}

describe('TeamCanvasPlay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listQuestions).mockResolvedValue([mockBoardQuestion] as unknown as ReturnType<typeof listQuestions> extends Promise<infer T> ? T : never)
    vi.mocked(watchTeamBoard).mockImplementation((_quizId, _teamId, onChange) => {
      onChange({ cards: [], connections: [] })
      return () => undefined
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders representative editor and allows editing and submission for blank canvas', async () => {
    const user = userEvent.setup()
    render(<TeamCanvasPlay quiz={baseQuiz} team={baseTeam} uid="rep-uid" />)

    await waitFor(() => {
      expect(screen.getByText(/You are editing for Canvas Team/i)).toBeInTheDocument()
    })

    const playBoard = screen.getByTestId('blank-canvas-play')
    expect(playBoard).toHaveAttribute('data-disabled', 'false')

    // Add a card
    await user.click(screen.getByRole('button', { name: /Add card/i }))

    // Submit for team button should be present
    const submitButtons = screen.getAllByRole('button', { name: /Submit for team/i })
    expect(submitButtons.length).toBeGreaterThan(0)

    await user.click(submitButtons[0])

    // Confirm dialog opens
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    const confirmButton = within(dialog).getByRole('button', { name: 'Submit for team' })
    await user.click(confirmButton)

    await waitFor(() => {
      expect(submitTeamAttempt).toHaveBeenCalledWith('quiz-canvas-1', 'team-1')
    })
  })

  it('renders read-only mode for teammates without submit button', async () => {
    render(<TeamCanvasPlay quiz={baseQuiz} team={baseTeam} uid="teammate-uid" />)

    await waitFor(() => {
      expect(screen.getByText(/Alice Rep is editing the concept board/i)).toBeInTheDocument()
    })

    expect(screen.queryByText(/You are editing for Canvas Team/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Submit for team/i })).not.toBeInTheDocument()

    const playBoard = screen.getByTestId('blank-canvas-play')
    expect(playBoard).toHaveAttribute('data-disabled', 'true')
  })

  it('renders prebuilt canvas play page when quiz.boardKind is prebuilt', async () => {
    const prebuiltQuiz: QuizRecord = {
      ...baseQuiz,
      boardKind: 'prebuilt',
    }
    render(<TeamCanvasPlay quiz={prebuiltQuiz} team={baseTeam} uid="rep-uid" />)

    await waitFor(() => {
      expect(screen.getByTestId('prebuilt-canvas-play')).toBeInTheDocument()
    })
  })
})
