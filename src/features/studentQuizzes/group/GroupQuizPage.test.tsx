import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'
import { GroupQuizPage } from './GroupQuizPage'
import { defaultQuizSettings } from '../../quizzes/schemas/settings'
import type { GroupParticipation, Quiz } from '../../quizzes/types'
import type { Team, TeamReveal, TeamSession } from '../../quizzes/types/team'
import { getQuiz } from '../../quizzes/services/quizService'
import {
  createSelfTeam, joinTeam, startTeamAttempt, submitTeamAnswer, watchMyTeamId, watchReveals, watchTeam, watchTeamSession,
} from '../../quizzes/services/teamService'

vi.mock('../../../app/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'me', email: 'me@example.test', displayName: 'Me' }, profile: { name: 'Me' } }) }))
vi.mock('../../../shared/ui/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }))
vi.mock('../../groups/services', () => ({ watchMyGroups: vi.fn((_uid: string, onChange: (items: unknown[]) => void) => { onChange([]); return () => undefined }) }))
vi.mock('../../quizzes/services/quizService', () => ({ getQuiz: vi.fn() }))
vi.mock('../../quizzes/services/teamService', () => ({
  watchMyTeamId: vi.fn(), watchTeam: vi.fn(), watchTeamSession: vi.fn(), watchReveals: vi.fn(),
  createSelfTeam: vi.fn(), joinTeam: vi.fn(), leaveTeam: vi.fn(), setRepresentative: vi.fn(), startTeamAttempt: vi.fn(),
  submitTeamAnswer: vi.fn(), lockTeamAnswer: vi.fn(), advanceTeam: vi.fn(), submitTeamAttempt: vi.fn(),
  describeTeamError: (reason: unknown) => (reason instanceof Error ? reason.message : 'Something went wrong.'),
}))

const group: GroupParticipation = { type: 'group', groupSize: 3, answerMode: 'representative', teamFormation: 'self', waitForEveryone: true, questionTimeSec: null }
const quizWith = (participation: Quiz['settings']['participation'], status: Quiz['status'] = 'published'): Quiz & { id: string } => ({
  ownerId: 'teacher', ownerName: 'Instructor', classId: 'class-1', title: 'Team quiz', description: '', tags: [], mode: 'quiz', status, questionCount: 2,
  createdAt: Timestamp.fromMillis(1), updatedAt: Timestamp.fromMillis(1), publishedAt: Timestamp.fromMillis(1),
  settings: { ...defaultQuizSettings('quiz'), participation }, id: 'quiz-1',
})
const team = (extra: Partial<Team> = {}): Team => ({
  id: 'team-1', name: 'Red Team', memberIds: ['me'], memberNames: { me: 'Me' }, representativeId: 'me', code: 'ABC234', studyGroupId: null,
  status: 'forming', score: null, maxScore: null, ...extra,
})
const session = (extra: Partial<TeamSession> = {}): TeamSession => ({
  phase: 'answering', currentIndex: 0, total: 2, questionStartedAt: Date.now(), questionEndsAt: null, reviewStartedAt: null,
  question: { id: 'q1', index: 0, type: 'multiple_choice', prompt: 'Capital of France?', points: 1, options: [{ id: 'a', text: 'Paris' }, { id: 'b', text: 'Rome' }] },
  answered: {}, picks: null, locked: false, ready: {}, ...extra,
})

interface World { myTeamId: string | null; team: Team | null; session: TeamSession | null; reveals: TeamReveal[] }
function setWorld(world: World) {
  vi.mocked(watchMyTeamId).mockImplementation((_uid, _quizId, onChange) => { onChange(world.myTeamId); return () => undefined })
  vi.mocked(watchTeam).mockImplementation((_quizId, _teamId, onChange) => { onChange(world.team); return () => undefined })
  vi.mocked(watchTeamSession).mockImplementation((_quizId, _teamId, onChange) => { onChange(world.session); return () => undefined })
  vi.mocked(watchReveals).mockImplementation((_quizId, _teamId, onChange) => { onChange(world.reveals); return () => undefined })
}

function renderPage() {
  return render(<MemoryRouter initialEntries={['/student/quizzes/quiz-1/team']}><Routes>
    <Route path="/student/quizzes/:quizId/team" element={<GroupQuizPage />} />
    <Route path="/student" element={<p>Student catalog</p>} />
  </Routes></MemoryRouter>)
}

beforeEach(() => {
  vi.mocked(getQuiz).mockResolvedValue(quizWith(group))
  setWorld({ myTeamId: null, team: null, session: null, reveals: [] })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('group quiz page: quiz and team loading', () => {
  it('shows an error when the quiz is not published', async () => {
    vi.mocked(getQuiz).mockResolvedValue(quizWith(group, 'draft'))
    renderPage()
    expect(await screen.findByText('This quiz is no longer available.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to practice' })).toBeInTheDocument()
  })

  it('refuses a quiz that is not a group quiz', async () => {
    vi.mocked(getQuiz).mockResolvedValue(quizWith({ type: 'individual' }))
    renderPage()
    expect(await screen.findByText('This is not a group quiz.')).toBeInTheDocument()
  })

  it('offers Retry when the quiz cannot be loaded and recovers', async () => {
    vi.mocked(getQuiz).mockRejectedValueOnce(new Error('Network down'))
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('Network down')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('button', { name: 'Join team' })).toBeInTheDocument()
  })

  it('says the team no longer exists when the team document is gone', async () => {
    setWorld({ myTeamId: 'team-1', team: null, session: null, reveals: [] })
    renderPage()
    expect(await screen.findByText('This team no longer exists')).toBeInTheDocument()
  })
})

describe('group quiz page: joining a team', () => {
  it('only asks the student to wait when the instructor builds the teams', async () => {
    vi.mocked(getQuiz).mockResolvedValue(quizWith({ ...group, teamFormation: 'assigned' }))
    renderPage()
    expect(await screen.findByText('Your instructor is building the teams')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Join team' })).not.toBeInTheDocument()
  })

  it('normalizes the typed code before joining', async () => {
    vi.mocked(joinTeam).mockResolvedValue(undefined as never)
    const user = userEvent.setup()
    renderPage()
    const input = await screen.findByLabelText('Team code')
    expect(screen.getByRole('button', { name: 'Join team' })).toBeDisabled()
    await user.type(input, 'abc-234')
    await user.click(screen.getByRole('button', { name: 'Join team' }))
    await waitFor(() => expect(joinTeam).toHaveBeenCalledWith('quiz-1', 'ABC234'))
  })

  it('keeps Join disabled for a malformed code', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByLabelText('Team code'), 'ABC')
    expect(screen.getByRole('button', { name: 'Join team' })).toBeDisabled()
    expect(screen.getByText('Codes have 6 letters and numbers.')).toBeInTheDocument()
  })

  it('shows the server message when joining fails', async () => {
    vi.mocked(joinTeam).mockRejectedValue(new Error('That team is full.'))
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByLabelText('Team code'), 'ABC234')
    await user.click(screen.getByRole('button', { name: 'Join team' }))
    expect(await screen.findByText('That team is full.')).toBeInTheDocument()
  })

  it('creates a team with a trimmed name and no study group by default', async () => {
    vi.mocked(createSelfTeam).mockResolvedValue(undefined as never)
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByLabelText('Team name'), '  Blue Team ')
    await user.click(screen.getByRole('button', { name: 'Create team' }))
    await waitFor(() => expect(createSelfTeam).toHaveBeenCalledWith('quiz-1', 'Blue Team', null))
  })
})

describe('group quiz page: lobby', () => {
  it('blocks Start until two people are on the team', async () => {
    setWorld({ myTeamId: 'team-1', team: team(), session: null, reveals: [] })
    renderPage()
    expect(await screen.findByText('Red Team')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Start quiz for the team/ })).toBeDisabled()
    expect(screen.getByText(/Starting unlocks when at least 2 people/)).toBeInTheDocument()
  })

  it('starts the quiz for a team of two', async () => {
    vi.mocked(startTeamAttempt).mockResolvedValue(undefined as never)
    setWorld({ myTeamId: 'team-1', team: team({ memberIds: ['me', 'sam'], memberNames: { me: 'Me', sam: 'Sam' }, status: 'ready' }), session: null, reveals: [] })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /Start quiz for the team/ }))
    await waitFor(() => expect(startTeamAttempt).toHaveBeenCalledWith('quiz-1', 'team-1'))
    expect(screen.getByRole('list', { name: 'Team members' })).toHaveTextContent('Sam')
  })

  it('explains the rules of this quiz', async () => {
    setWorld({ myTeamId: 'team-1', team: team(), session: null, reveals: [] })
    renderPage()
    expect(await screen.findByText(/One teammate, the representative, submits the answer/)).toBeInTheDocument()
    expect(screen.getByText(/waits for everyone/)).toBeInTheDocument()
  })
})

describe('group quiz page: playing', () => {
  const playing = (uid: string): Team => team({ memberIds: ['me', 'sam'], memberNames: { me: 'Me', sam: 'Sam' }, representativeId: uid, status: 'in_progress' })

  it('lets the representative submit the team answer', async () => {
    vi.mocked(submitTeamAnswer).mockResolvedValue(undefined as never)
    setWorld({ myTeamId: 'team-1', team: playing('me'), session: session(), reveals: [] })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('radio', { name: /Paris/ }))
    await user.click(screen.getByRole('button', { name: /Submit team answer/ }))
    await waitFor(() => expect(submitTeamAnswer).toHaveBeenCalledWith('quiz-1', 'team-1', 0, 'a'))
  })

  it('keeps a non-representative from answering and says why', async () => {
    setWorld({ myTeamId: 'team-1', team: playing('sam'), session: session(), reveals: [] })
    renderPage()
    expect(await screen.findByText(/Your representative answers for the team/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Submit team answer/ })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Paris/ })).toBeDisabled()
  })

  it('shows who has answered without revealing choices', async () => {
    setWorld({ myTeamId: 'team-1', team: playing('me'), session: session({ answered: { sam: true } }), reveals: [] })
    renderPage()
    const progress = await screen.findByRole('list', { name: 'Who has answered' })
    expect(progress).toHaveTextContent('Sam')
    expect(progress).toHaveTextContent('Answered')
  })

  it('shows the result of a closed question with text, not only colour', async () => {
    const reveal: TeamReveal = {
      index: 0, questionId: 'q1', question: { type: 'multiple_choice', prompt: 'Capital of France?', points: 1, options: [{ id: 'a', text: 'Paris' }, { id: 'b', text: 'Rome' }] },
      finalAnswer: 'b', picks: {}, lockedBy: null, auto: false,
      result: { correct: false, pointsAwarded: 0, correctAnswer: 'a', explanation: 'Paris is the capital.' },
    }
    setWorld({ myTeamId: 'team-1', team: playing('me'), session: session({ phase: 'review' }), reveals: [reveal] })
    renderPage()
    expect(await screen.findByText('Not quite')).toBeInTheDocument()
    expect(screen.getByText('Paris is the capital.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next question' })).toBeInTheDocument()
  })
})

describe('group quiz page: results', () => {
  it('shows the shared score after the team submitted', async () => {
    setWorld({ myTeamId: 'team-1', team: team({ status: 'submitted', score: 3, maxScore: 4, memberIds: ['me', 'sam'], memberNames: { me: 'Me', sam: 'Sam' } }), session: null, reveals: [] })
    renderPage()
    expect(await screen.findByText('Red Team finished')).toBeInTheDocument()
    expect(screen.getByLabelText('Team score 3 / 4')).toBeInTheDocument()
  })

  it('tells the student when scores are held back', async () => {
    setWorld({ myTeamId: 'team-1', team: team({ status: 'submitted', score: null, maxScore: null }), session: null, reveals: [] })
    renderPage()
    expect(await screen.findByText(/Your instructor decides when scores are shown/)).toBeInTheDocument()
  })
})
