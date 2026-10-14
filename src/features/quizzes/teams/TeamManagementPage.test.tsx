import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'
import { TeamManagementPage } from './TeamManagementPage'
import { defaultQuizSettings } from '../schemas/settings'
import type { Participation, Quiz } from '../types'
import type { Team } from '../types/team'
import type { EnrollmentWithId } from '../../classes/types'
import { getQuiz } from '../services/quizService'
import { getClass } from '../../classes/services/classService'
import { listEnrollments } from '../../classes/services/enrollmentService'
import { addTeamMember, createTeam, deleteTeam, overrideTeamQuestion, removeTeamMember, setRepresentative, watchQuizTeams } from '../services/teamService'

// The signed-in user must be the SAME object on every render, like the real useAuth. A fresh object each time would make the page reload forever.
const { showToast, signedIn } = vi.hoisted(() => ({
  showToast: vi.fn(),
  signedIn: { user: { uid: 'teacher', email: 't@example.test', displayName: 'Teacher' }, profile: { name: 'Teacher' } },
}))
vi.mock('../../../app/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('../../auth/useAuth', () => ({ useAuth: () => signedIn }))
vi.mock('../../../shared/ui/useToast', () => ({ useToast: () => ({ showToast }) }))
vi.mock('../services/quizService', () => ({ getQuiz: vi.fn() }))
vi.mock('../../classes/services/classService', () => ({ getClass: vi.fn() }))
vi.mock('../../classes/services/enrollmentService', () => ({ listEnrollments: vi.fn() }))
vi.mock('../services/teamService', () => ({
  watchQuizTeams: vi.fn(), watchTeamSession: vi.fn((_q, _t, cb) => { cb?.({ phase: 'answering', currentIndex: 0 }); return () => {} }),
  addTeamMember: vi.fn(), createTeam: vi.fn(), deleteTeam: vi.fn(), overrideTeamQuestion: vi.fn(), removeTeamMember: vi.fn(), setRepresentative: vi.fn(),
  describeTeamError: (reason: unknown) => (reason instanceof Error ? reason.message : 'Something went wrong.'),
}))

const group = (teamFormation: 'assigned' | 'self' = 'assigned'): Participation => ({ type: 'group', groupSize: 3, answerMode: 'representative', teamFormation, waitForEveryone: true, questionTimeSec: null })
const quizWith = (participation: Participation, extra: Partial<Quiz> = {}): Quiz & { id: string } => ({
  ownerId: 'teacher', ownerName: 'Teacher', classId: 'class-1', title: 'Team quiz', description: '', tags: [], mode: 'quiz', status: 'published', questionCount: 2,
  createdAt: Timestamp.fromMillis(1), updatedAt: Timestamp.fromMillis(1), publishedAt: Timestamp.fromMillis(1),
  settings: { ...defaultQuizSettings('quiz'), participation }, id: 'quiz-1', ...extra,
})
const student = (uid: string, name: string): EnrollmentWithId => ({
  id: `class-1_${uid}`, classId: 'class-1', ownerId: 'teacher', uid, studentName: name, studentPhotoURL: null, className: 'Math', status: 'active', codeUsed: 'ABC234', joinedAt: Timestamp.now(), updatedAt: Timestamp.now(),
})
const team = (extra: Partial<Team> = {}): Team => ({
  id: 'team-1', name: 'Red Team', memberIds: ['ana', 'ben'], memberNames: { ana: 'Ana', ben: 'Ben' }, representativeId: 'ana', code: null, studyGroupId: null,
  status: 'forming', score: null, maxScore: null, ...extra,
})

let teams: Team[] = []
function renderPage() {
  return render(<MemoryRouter initialEntries={['/instructor/quizzes/quiz-1/teams']}><Routes>
    <Route path="/instructor/quizzes/:quizId/teams" element={<TeamManagementPage />} />
  </Routes></MemoryRouter>)
}

beforeEach(() => {
  teams = [team()]
  vi.mocked(getQuiz).mockResolvedValue(quizWith(group()))
  vi.mocked(getClass).mockResolvedValue({ id: 'class-1', name: 'Math' } as never)
  vi.mocked(listEnrollments).mockResolvedValue([student('ana', 'Ana'), student('ben', 'Ben'), student('cy', 'Cy')])
  vi.mocked(watchQuizTeams).mockImplementation((_quizId, onChange) => { onChange(teams); return () => undefined })
  for (const fn of [addTeamMember, createTeam, deleteTeam, overrideTeamQuestion, removeTeamMember, setRepresentative]) vi.mocked(fn).mockResolvedValue(undefined as never)
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('team management page: loading and access', () => {
  it('lists teams, members and the students who still need a team', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Red Team' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Members of Red Team' })).toHaveTextContent('Ana')
    const waiting = screen.getByRole('list', { name: 'Students without a team' })
    expect(waiting).toHaveTextContent('Cy')
    expect(waiting).not.toHaveTextContent('Ana')
  })

  it('explains when the quiz is not a group quiz', async () => {
    vi.mocked(getQuiz).mockResolvedValue(quizWith({ type: 'individual' }))
    renderPage()
    expect(await screen.findByText(/not a group quiz/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New team' })).not.toBeInTheDocument()
  })

  it('only lets the owner manage teams', async () => {
    vi.mocked(getQuiz).mockResolvedValue(quizWith(group(), { ownerId: 'someone-else' }))
    renderPage()
    expect(await screen.findByText('Teams can only be managed by the quiz owner.')).toBeInTheDocument()
  })

  it('asks to link a class first when the quiz has none', async () => {
    vi.mocked(getQuiz).mockResolvedValue(quizWith(group(), { classId: null }))
    renderPage()
    expect(await screen.findByText(/Link this quiz to a class first/)).toBeInTheDocument()
  })

  it('offers Retry when loading fails and recovers', async () => {
    vi.mocked(getQuiz).mockRejectedValueOnce(new Error('Network down'))
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('Network down')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'Red Team' })).toBeInTheDocument()
  })

  it('shows an empty state when there are no teams', async () => {
    teams = []
    renderPage()
    expect(await screen.findByText('No teams yet')).toBeInTheDocument()
  })

  it('hides team creation when students form their own teams', async () => {
    vi.mocked(getQuiz).mockResolvedValue(quizWith(group('self')))
    renderPage()
    expect(await screen.findByText('Students form their own teams')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New team' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Auto-assign/ })).not.toBeInTheDocument()
  })
})

describe('team management page: changing teams', () => {
  it('creates a team from the unassigned students', async () => {
    teams = [team({ memberIds: ['ana'], memberNames: { ana: 'Ana' } })]
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'New team' }))
    await user.click(await screen.findByRole('checkbox', { name: 'Ben' }))
    await user.click(screen.getByRole('checkbox', { name: 'Cy' }))
    await user.click(screen.getByRole('button', { name: 'Create team' }))
    await waitFor(() => expect(createTeam).toHaveBeenCalledWith('quiz-1', 'Team 2', ['ben', 'cy'], 'ben'))
    expect(showToast).toHaveBeenCalledWith('success', 'Team 2 was created.')
  })

  it('auto-assigns every unassigned student exactly once', async () => {
    teams = []
    vi.mocked(listEnrollments).mockResolvedValue([student('ana', 'Ana'), student('ben', 'Ben'), student('cy', 'Cy'), student('dev', 'Dev')])
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /Auto-assign/ }))
    await user.click(await screen.findByRole('button', { name: /^Create \d+ teams?$/ }))
    await waitFor(() => expect(createTeam).toHaveBeenCalled())
    const calls = vi.mocked(createTeam).mock.calls
    const members = calls.flatMap(call => call[2] as string[])
    expect([...members].sort()).toEqual(['ana', 'ben', 'cy', 'dev'])
    for (const call of calls) expect((call[2] as string[]).length).toBeLessThanOrEqual(3)
  })

  it('adds a waiting student to a team with room', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.selectOptions(await screen.findByLabelText('Add a student to Red Team'), 'cy')
    await user.click(screen.getByRole('button', { name: /Add member/ }))
    await waitFor(() => expect(addTeamMember).toHaveBeenCalledWith('quiz-1', 'team-1', 'cy'))
  })

  it('removes a member', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Remove Ben from Red Team' }))
    await waitFor(() => expect(removeTeamMember).toHaveBeenCalledWith('quiz-1', 'team-1', 'ben'))
  })

  it('changes the representative', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Make Ben the representative' }))
    await waitFor(() => expect(setRepresentative).toHaveBeenCalledWith('quiz-1', 'team-1', 'ben'))
  })

  it('asks for confirmation before deleting a team', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Delete Red Team' }))
    expect(deleteTeam).not.toHaveBeenCalled()
    await user.click(await screen.findByRole('button', { name: 'Delete team' }))
    await waitFor(() => expect(deleteTeam).toHaveBeenCalledWith('quiz-1', 'team-1'))
  })

  it('shows the server message in a toast when a change fails', async () => {
    vi.mocked(removeTeamMember).mockRejectedValue(new Error('This team already started.'))
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Remove Ben from Red Team' }))
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('error', 'This team already started.'))
  })

  it('locks a team that is already playing', async () => {
    teams = [team({ status: 'in_progress' })]
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Red Team' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Red Team' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Remove Ben from Red Team' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Make Ben the representative' })).not.toBeInTheDocument()
  })

  it('allows the instructor to advance a stuck team that is playing', async () => {
    teams = [team({ status: 'in_progress' })]
    const user = userEvent.setup()
    renderPage()
    const advanceBtn = await screen.findByRole('button', { name: 'Advance stuck team Red Team' })
    expect(advanceBtn).toBeInTheDocument()
    await user.click(advanceBtn)
    await waitFor(() => expect(overrideTeamQuestion).toHaveBeenCalledWith('quiz-1', 'team-1', 0, 'answering'))
  })
})
