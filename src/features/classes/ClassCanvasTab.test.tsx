import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Timestamp } from 'firebase/firestore'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../shared/ui/ToastProvider'
import { ClassCanvasTab } from './ClassCanvasTab'
import { ClassQuizzesTab } from './ClassQuizzesTab'
import { ClassActivityList } from './ClassActivityList'
import { ClassPage } from './ClassPage'
import { QuickCreateQuiz } from '../quizzes/authoring/QuickCreateQuiz'
import type { QuizRecord } from '../quizzes/services'
import type { ClassWithId } from './types'
import type { ActivityFeed } from './classActivities'

const mocked = vi.hoisted(() => ({
  showToast: vi.fn(),
  watchQuizzesForClass: vi.fn(),
  watchClass: vi.fn(),
  watchEnrollments: vi.fn(),
  listMyClasses: vi.fn(),
  countStudentsInClass: vi.fn(),
  countPendingEnrollments: vi.fn(),
  countClassEnrollments: vi.fn(),
  duplicateQuiz: vi.fn(async () => 'new-quiz-id'),
  publishQuiz: vi.fn(async () => undefined),
  unpublishQuiz: vi.fn(async () => undefined),
  archiveQuiz: vi.fn(async () => undefined),
  restoreQuiz: vi.fn(async () => undefined),
  deleteQuizCascade: vi.fn(async () => undefined),
  countQuizAttempts: vi.fn(async () => 3),
  copyQuizToClass: vi.fn(async () => 'copied-quiz-id'),
  createQuiz: vi.fn(async () => 'created-quiz-id'),
  watchMyClasses: vi.fn(),
  user: { uid: 'teacher', displayName: 'Teacher' },
  profile: { name: 'Teacher' },
}))

vi.mock('../../lib/firebase/firestore', () => ({
  firestore: {},
}))
vi.mock('../../app/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('../../shared/ui/useToast', () => ({ useToast: () => ({ showToast: mocked.showToast }) }))
vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user: mocked.user }),
}))
vi.mock('../profile/useUserProfile', () => ({
  useUserProfile: () => ({ profile: mocked.profile }),
}))
vi.mock('./services', () => ({
  listMyClasses: mocked.listMyClasses,
  watchClass: mocked.watchClass,
  rotateJoinCode: vi.fn(async () => undefined),
  setJoinEnabled: vi.fn(async () => undefined),
}))
vi.mock('./services/enrollmentService', () => ({
  watchEnrollments: mocked.watchEnrollments,
  countStudentsInClass: mocked.countStudentsInClass,
  countPendingEnrollments: mocked.countPendingEnrollments,
  countClassEnrollments: mocked.countClassEnrollments,
}))
vi.mock('./services/classService', () => ({
  watchMyClasses: mocked.watchMyClasses,
}))
vi.mock('./services/quizService', () => ({
  watchQuizzesForClass: mocked.watchQuizzesForClass,
  copyQuizToClass: mocked.copyQuizToClass,
}))
vi.mock('../quizzes/services', () => ({
  duplicateQuiz: mocked.duplicateQuiz,
  publishQuiz: mocked.publishQuiz,
  unpublishQuiz: mocked.unpublishQuiz,
  archiveQuiz: mocked.archiveQuiz,
  restoreQuiz: mocked.restoreQuiz,
  deleteQuizCascade: mocked.deleteQuizCascade,
  countQuizAttempts: mocked.countQuizAttempts,
  createQuiz: mocked.createQuiz,
}))
vi.mock('../modules/ModulesTab', () => ({
  ModulesTab: () => <div data-testid="modules-tab">Modules Tab Content</div>,
}))
vi.mock('./ClassPeopleTab', () => ({
  ClassPeopleTab: () => <div data-testid="people-tab">People Tab Content</div>,
}))
vi.mock('./ClassSettingsTab', () => ({
  ClassSettingsTab: () => <div data-testid="settings-tab">Settings Tab Content</div>,
}))
vi.mock('./ClassCodePanel', () => ({
  ClassCodePanel: () => <div data-testid="code-panel">Class Code Panel</div>,
}))

const now = Timestamp.fromMillis(1_700_000_000_000)
const classroom: ClassWithId = {
  id: 'class-1',
  ownerId: 'teacher',
  ownerName: 'Teacher',
  name: 'Biology 101',
  section: 'A',
  subject: 'Science',
  description: '',
  joinCode: 'BIO101',
  joinEnabled: true,
  requireApproval: false,
  status: 'active',
  accent: 'pinstripe',
  createdAt: now,
  updatedAt: now,
  codeRotatedAt: now,
}

const otherClass: ClassWithId = {
  id: 'class-2',
  ownerId: 'teacher',
  ownerName: 'Teacher',
  name: 'Chemistry 101',
  section: 'B',
  subject: 'Science',
  description: '',
  joinCode: 'CHM101',
  joinEnabled: true,
  requireApproval: false,
  status: 'active',
  accent: 'solid',
  createdAt: now,
  updatedAt: now,
  codeRotatedAt: now,
}

function makeQuiz(
  id: string,
  title: string,
  mode: QuizRecord['mode'],
  status: QuizRecord['status'] = 'draft',
  questionCount = 1,
): QuizRecord {
  return {
    id,
    ownerId: 'teacher',
    ownerName: 'Teacher',
    classId: 'class-1',
    title,
    description: '',
    tags: [],
    mode,
    status,
    questionCount,
    createdAt: now,
    updatedAt: now,
    publishedAt: status === 'published' ? now : null,
    settings: {
      answerReveal: 'after_submit',
      participation: { type: 'individual' },
      scoreVisibility: 'after_release',
      scoresReleased: false,
      timeLimitMinutes: null,
      attemptsAllowed: 1,
      shuffleQuestions: false,
      shuffleOptions: false,
    },
  }
}

const sampleActivities: QuizRecord[] = [
  makeQuiz('q-1', 'Cell Biology Quiz', 'quiz', 'published', 5),
  makeQuiz('f-1', 'Cell Terms Flashcards', 'flashcards', 'draft', 10),
  makeQuiz('c-1', 'Ecosystem Canvas', 'canvas', 'published', 1),
  makeQuiz('c-2', 'Empty Canvas Board', 'canvas', 'draft', 0),
]

function renderWithProviders(element: ReactNode, initialEntries = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ToastProvider>{element}</ToastProvider>
    </MemoryRouter>,
  )
}

function feed(items: QuizRecord[], overrides: Partial<ActivityFeed> = {}): ActivityFeed {
  return { items, loading: false, error: null, onRetry: vi.fn(), ...overrides }
}

describe('Canvas Tab and Class Page Integration', () => {
  beforeEach(() => {
    mocked.listMyClasses.mockResolvedValue([classroom, otherClass])
    mocked.watchClass.mockImplementation((_, onNext) => {
      onNext(classroom)
      return () => undefined
    })
    mocked.watchEnrollments.mockImplementation((_, __, onNext) => {
      onNext([])
      return () => undefined
    })
    mocked.countStudentsInClass.mockResolvedValue(10)
    mocked.countPendingEnrollments.mockResolvedValue(2)
    mocked.countClassEnrollments.mockResolvedValue(12)
    mocked.watchQuizzesForClass.mockImplementation((_, __, onNext) => {
      onNext(sampleActivities)
      return () => undefined
    })
    mocked.watchMyClasses.mockImplementation((_, onNext) => {
      onNext([classroom, otherClass])
      return () => undefined
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders tabs in order Modules, Quizzes, Canvas, People, Settings with count badges', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/instructor/classes/:classId" element={<ClassPage />} />
      </Routes>,
      ['/instructor/classes/class-1'],
    )

    const tablist = await screen.findByRole('tablist', { name: 'Biology 101 sections' })
    const tabs = within(tablist).getAllByRole('tab')
    const labels = tabs.map((tab) => tab.textContent?.trim())

    // 1 quiz + 1 flashcard = 2 quizzes; 2 canvas activities
    expect(labels[0]).toMatch(/Modules/)
    expect(labels[1]).toMatch(/Quizzes\s*2\s*2 items/)
    expect(labels[2]).toMatch(/Canvas\s*2\s*2 items/)
    expect(labels[3]).toMatch(/People\s*12\s*12 items/)
    expect(labels[4]).toMatch(/Settings/)

    // Stat tile should show honest combined activities count
    expect(screen.getByText('Activities')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText(/2 quizzes · 2 canvas/)).toBeInTheDocument()
  })

  it('deep links directly to ?tab=canvas and shows canvas tab content', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/instructor/classes/:classId" element={<ClassPage />} />
      </Routes>,
      ['/instructor/classes/class-1?tab=canvas'],
    )

    const canvasTab = await screen.findByRole('tab', { name: /Canvas/ })
    expect(canvasTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { level: 2, name: 'Canvas activities' })).toBeInTheDocument()
    expect(screen.getByText('Ecosystem Canvas')).toBeInTheDocument()
    expect(screen.getByText('Empty Canvas Board')).toBeInTheDocument()
    // Normal quiz should NOT be in the Canvas tab
    expect(screen.queryByText('Cell Biology Quiz')).not.toBeInTheDocument()
  })

  it('falls back to Modules tab when an unknown tab query is provided', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/instructor/classes/:classId" element={<ClassPage />} />
      </Routes>,
      ['/instructor/classes/class-1?tab=unknown-tab'],
    )

    const modulesTab = await screen.findByRole('tab', { name: /Modules/ })
    expect(modulesTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('modules-tab')).toBeInTheDocument()
  })

  it('shows a loading skeleton, not the empty state, before the first quiz snapshot arrives', async () => {
    mocked.watchQuizzesForClass.mockImplementation(() => () => undefined)
    renderWithProviders(
      <Routes><Route path="/instructor/classes/:classId" element={<ClassPage />} /></Routes>,
      ['/instructor/classes/class-1?tab=canvas'],
    )
    expect(await screen.findByRole('heading', { level: 2, name: 'Canvas activities' })).toBeInTheDocument()
    expect(screen.queryByText('No canvas activities yet')).not.toBeInTheDocument()
    expect(screen.getAllByLabelText('Loading activity').length).toBeGreaterThan(0)
  })

  it('shows only the error alert with Retry when the class quiz watch fails', async () => {
    mocked.watchQuizzesForClass.mockImplementation((_, __, _onNext, onError) => {
      onError(new Error('Quiz list is unavailable.'))
      return () => undefined
    })
    renderWithProviders(
      <Routes><Route path="/instructor/classes/:classId" element={<ClassPage />} /></Routes>,
      ['/instructor/classes/class-1?tab=canvas'],
    )
    expect(await screen.findByText('Quiz list is unavailable.')).toBeInTheDocument()
    expect(screen.queryByText('No canvas activities yet')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(mocked.watchQuizzesForClass).toHaveBeenCalledTimes(2)
  })

  it('Quizzes tab filters out canvas activities and links to Canvas tab in header note', async () => {
    renderWithProviders(
      <ClassQuizzesTab classroom={classroom} classes={[classroom, otherClass]} feed={feed(sampleActivities)} />,
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Quizzes' })).toBeInTheDocument()
    expect(screen.getByText('Looking for canvas boards?')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Open the Canvas tab.' })
    expect(link).toHaveAttribute('href', expect.stringContaining('?tab=canvas'))

    // Quiz and flashcard are present
    expect(screen.getByText('Cell Biology Quiz')).toBeInTheDocument()
    expect(screen.getByText('Cell Terms Flashcards')).toBeInTheDocument()
    // Canvas activities are excluded
    expect(screen.queryByText('Ecosystem Canvas')).not.toBeInTheDocument()
    expect(screen.queryByText('Empty Canvas Board')).not.toBeInTheDocument()
  })

  it('Canvas tab displays "Board ready" vs "Add cards and connections" based on board status', async () => {
    renderWithProviders(
      <ClassCanvasTab classroom={classroom} classes={[classroom, otherClass]} feed={feed(sampleActivities)} />,
    )

    expect(screen.getByText('Ecosystem Canvas')).toBeInTheDocument()
    expect(screen.getByText('Board ready')).toBeInTheDocument()
    expect(screen.getByText('Empty Canvas Board')).toBeInTheDocument()
    expect(screen.getByText('Add cards and connections')).toBeInTheDocument()
    expect(screen.getAllByText('Canvas', { selector: '.badge' }).length).toBe(2)

    const createBtn = screen.getByRole('link', { name: /Create canvas/i })
    expect(createBtn).toHaveAttribute('href', '/instructor/quizzes/new?classId=class-1&mode=canvas')
  })

  it('Canvas tab empty state explains what canvas is and shows Create canvas button', async () => {
    renderWithProviders(
      <ClassCanvasTab classroom={classroom} classes={[classroom, otherClass]} feed={feed(sampleActivities.filter((item) => item.mode !== 'canvas'))} />,
    )

    expect(
      screen.getByText('Students connect related cards on a board and are graded on their connections.'),
    ).toBeInTheDocument()
    expect(screen.getByText('No canvas activities yet')).toBeInTheDocument()
    const links = screen.getAllByRole('link', { name: /Create canvas/i })
    expect(links).toHaveLength(2)
    links.forEach((link) => expect(link).toHaveAttribute('href', '/instructor/quizzes/new?classId=class-1&mode=canvas'))
  })

  it('Quizzes tab empty state reflects only quiz and flashcards modes', () => {
    renderWithProviders(
      <ClassQuizzesTab classroom={classroom} classes={[classroom]} feed={feed(sampleActivities.filter((item) => item.mode === 'canvas'))} />,
    )
    expect(screen.getByText('No quizzes in this class yet')).toBeInTheDocument()
  })

  it('ClassActivityList preserves empty and error state exclusivity', () => {
    const onRetry = vi.fn()

    // Error state: shows error alert, NOT empty state
    const { rerender } = render(
      <MemoryRouter>
        <ClassActivityList
          classroom={classroom}
          classes={[classroom]}
          activities={[]}
          loading={false}
          error="Failed to load activities"
          onRetry={onRetry}
          emptyTitle="No items"
          emptyDescription="Empty description"
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('Failed to load activities')).toBeInTheDocument()
    expect(screen.queryByText('No items')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledOnce()

    // Empty state: shows empty state, NOT error
    rerender(
      <MemoryRouter>
        <ClassActivityList
          classroom={classroom}
          classes={[classroom]}
          activities={[]}
          loading={false}
          error={null}
          onRetry={onRetry}
          emptyTitle="No items"
          emptyDescription="Empty description"
        />
      </MemoryRouter>,
    )
    expect(screen.queryByText('Failed to load activities')).not.toBeInTheDocument()
    expect(screen.getByText('No items')).toBeInTheDocument()
    expect(screen.getByText('Empty description')).toBeInTheDocument()
  })

  it('ClassActivityList supports row actions: Duplicate, Copy to another class, Publish, and Delete', async () => {
    const canvasQuiz = makeQuiz('c-1', 'Cell Structure Canvas', 'canvas', 'draft', 1)
    renderWithProviders(
      <ClassActivityList
        classroom={classroom}
        classes={[classroom, otherClass]}
        activities={[canvasQuiz]}
        loading={false}
        error={null}
        onRetry={vi.fn()}
        emptyTitle="No items"
        emptyDescription="Empty"
      />,
    )

    // Duplicate action
    fireEvent.click(screen.getByRole('button', { name: /Duplicate/i }))
    await waitFor(() => expect(mocked.duplicateQuiz).toHaveBeenCalledWith('c-1'))

    // Publish action
    fireEvent.click(screen.getByRole('button', { name: /Publish/i }))
    await waitFor(() => expect(mocked.publishQuiz).toHaveBeenCalledWith('c-1'))

    // Copy to another class
    fireEvent.click(screen.getByRole('button', { name: /Copy to another class/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Copy canvas to another class' })
    expect(dialog).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy canvas' }))
    await waitFor(() => expect(mocked.copyQuizToClass).toHaveBeenCalledWith('c-1', 'class-2'))

    // Delete action with submissions confirmation
    fireEvent.click(screen.getByRole('button', { name: /Delete/i }))
    const confirmDialog = await screen.findByRole('dialog', { name: 'Delete this canvas?' })
    expect(confirmDialog).toBeInTheDocument()
    expect(screen.getByText(/3 student submissions and all canvas content/i)).toBeInTheDocument()
    const deleteConfirmBtn = within(confirmDialog).getByRole('button', { name: 'Delete canvas' })
    expect(deleteConfirmBtn).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Type Cell Structure Canvas to confirm'), {
      target: { value: 'Cell Structure Canvas' },
    })
    expect(deleteConfirmBtn).toBeEnabled()
    fireEvent.click(deleteConfirmBtn)
    await waitFor(() => expect(mocked.deleteQuizCascade).toHaveBeenCalledWith('c-1'))
  })

  it('QuickCreateQuiz locks to Canvas and shows lock note when coming from Canvas tab', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/instructor/quizzes/new" element={<QuickCreateQuiz />} />
      </Routes>,
      ['/instructor/quizzes/new?classId=class-1&mode=canvas'],
    )

    expect(await screen.findByRole('dialog', { name: 'Create canvas' })).toBeInTheDocument()
    expect(screen.getByText('Locked to Canvas for activities created from the Canvas tab.')).toBeInTheDocument()

    // Non-canvas options are disabled
    const quizOption = screen.getByRole('button', { name: /Quiz/i })
    expect(quizOption).toBeDisabled()
    const flashcardsOption = screen.getByRole('button', { name: /Flashcards/i })
    expect(flashcardsOption).toBeDisabled()

    const submitBtn = screen.getByRole('button', { name: 'Create canvas' })
    expect(submitBtn).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Bio Connections' } })
    expect(submitBtn).toBeEnabled()
    fireEvent.click(submitBtn)

    await waitFor(() =>
      expect(mocked.createQuiz).toHaveBeenCalledWith(
        'teacher',
        'Teacher',
        expect.objectContaining({
          classId: 'class-1',
          title: 'Bio Connections',
          mode: 'canvas',
        }),
      ),
    )
  })

  it('QuickCreateQuiz preselects flashcards when mode=flashcards is passed without class locking', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/instructor/quizzes/new" element={<QuickCreateQuiz />} />
      </Routes>,
      ['/instructor/quizzes/new?mode=flashcards'],
    )

    expect(await screen.findByRole('dialog', { name: 'Create flashcards' })).toBeInTheDocument()
    expect(screen.queryByText(/Locked to Canvas/)).not.toBeInTheDocument()

    // Picker is not locked: user can switch to Quiz
    const quizOption = screen.getByRole('button', { name: /Quiz/i })
    expect(quizOption).not.toBeDisabled()
    fireEvent.click(quizOption)

    expect(screen.getByRole('button', { name: 'Create quiz' })).toBeInTheDocument()
  })
})
