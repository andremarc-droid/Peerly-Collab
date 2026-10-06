import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'
import type { ReactNode } from 'react'
import { StudentModulePage } from './StudentModulePage'
import type { ModuleResourceWithId, ModuleWithId } from './types'
import type { ClassWithId, EnrollmentWithId } from '../classes/types'
import type { QuizRecord } from '../quizzes/services/quizService'
import { defaultQuizSettings } from '../quizzes/schemas/settings'

const mocks = vi.hoisted(() => ({
  user: { uid: 'student-1', displayName: 'Sam' },
  showToast: vi.fn(),
  listEnrollments: vi.fn(),
  watchClass: vi.fn(),
  subscribeToModule: vi.fn(),
  subscribeToResources: vi.fn(),
  watchPublishedQuizzes: vi.fn(),
}))

vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ user: mocks.user, status: 'signedIn' }) }))
vi.mock('../../shared/ui/useToast', () => ({ useToast: () => ({ showToast: mocks.showToast }) }))
vi.mock('../../app/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('../classes/services/joinService', () => ({ listMyEnrollments: mocks.listEnrollments }))
vi.mock('../classes/services/classService', () => ({ watchClass: mocks.watchClass }))
vi.mock('../classes/services/quizService', () => ({ watchPublishedQuizzesForClass: mocks.watchPublishedQuizzes }))
vi.mock('./services', () => ({
  subscribeToModule: mocks.subscribeToModule,
  subscribeToResources: mocks.subscribeToResources,
}))

const now = Timestamp.fromMillis(1_700_000_000_000)
const classroom: ClassWithId = {
  id: 'class-1', ownerId: 'teacher', ownerName: 'Morgan', name: 'Biology 101', section: 'A', subject: 'Science', description: '',
  joinCode: 'ABC234', joinEnabled: true, requireApproval: false, status: 'active', accent: 'pinstripe', createdAt: now, updatedAt: now, codeRotatedAt: now,
}
const enrollment: EnrollmentWithId = {
  id: 'class-1_student-1', classId: 'class-1', ownerId: 'teacher', uid: 'student-1', studentName: 'Sam', studentPhotoURL: null,
  className: 'Biology 101', status: 'active', codeUsed: 'ABC234', joinedAt: now, updatedAt: now,
}

const publishedQuiz: QuizRecord = {
  id: 'quiz-pub', ownerId: 'teacher', ownerName: 'Morgan', classId: 'class-1', title: 'Cell Structure Quiz',
  description: 'Practice quiz on cell organelles', tags: [], mode: 'quiz', status: 'published', questionCount: 5,
  createdAt: now, updatedAt: now, publishedAt: now, settings: defaultQuizSettings('quiz'),
}
const draftQuiz: QuizRecord = {
  id: 'quiz-draft', ownerId: 'teacher', ownerName: 'Morgan', classId: 'class-1', title: 'Secret Upcoming Exam',
  description: 'Unpublished draft quiz', tags: [], mode: 'quiz', status: 'draft', questionCount: 10,
  createdAt: now, updatedAt: now, publishedAt: null, settings: defaultQuizSettings('quiz'),
}

const moduleRecord: ModuleWithId = {
  id: 'mod-1', classId: 'class-1', ownerId: 'teacher', title: 'Cellular Biology Basics',
  description: 'Introduction to cell organelles and membrane transport',
  order: 0, status: 'published', quizIds: ['quiz-pub', 'quiz-draft', 'quiz-deleted'], resourceCount: 4,
  createdAt: now, updatedAt: now, publishedAt: now,
}

const sampleResources: ModuleResourceWithId[] = [
  {
    id: 'res-text',
    type: 'text',
    title: 'Study Guidelines',
    body: 'Read through the slides before attempting the practice quiz.',
    order: 0,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'res-drive',
    type: 'drive',
    title: 'Organelles Presentation',
    driveFileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz',
    driveKind: 'slides',
    order: 1,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'res-youtube',
    type: 'youtube',
    title: 'Membrane Transport Video',
    youtubeVideoId: 'dQw4w9WgXcQ',
    order: 2,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'res-link',
    type: 'link',
    title: 'Cell Biology Reference Portal',
    url: 'https://example.org/cell-biology',
    order: 3,
    createdAt: now,
    updatedAt: now,
  },
]

function renderModulePage(classId = 'class-1', moduleId = 'mod-1') {
  return render(
    <MemoryRouter initialEntries={[`/student/classes/${classId}/modules/${moduleId}`]}>
      <Routes>
        <Route path="/student/classes/:classId/modules/:moduleId" element={<StudentModulePage />} />
        <Route path="/student/classes/:classId" element={<h1>Class Homepage</h1>} />
        <Route path="/student/quizzes/:quizId" element={<h1>Quiz Intro Page</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mocks.showToast.mockClear()
  mocks.listEnrollments.mockImplementation((_uid: string, onChange: (items: EnrollmentWithId[]) => void) => {
    onChange([enrollment])
    return () => undefined
  })
  mocks.watchClass.mockImplementation((_id: string, onChange: (val: ClassWithId) => void) => {
    onChange(classroom)
    return () => undefined
  })
  mocks.subscribeToModule.mockImplementation((_cId: string, _mId: string, onChange: (val: ModuleWithId | null) => void) => {
    onChange(moduleRecord)
    return () => undefined
  })
  mocks.subscribeToResources.mockImplementation((_cId: string, _mId: string, onChange: (items: ModuleResourceWithId[]) => void) => {
    onChange(sampleResources)
    return () => undefined
  })
  mocks.watchPublishedQuizzes.mockImplementation((_cId: string, onChange: (items: QuizRecord[]) => void) => {
    onChange([publishedQuiz])
    return () => undefined
  })
})
afterEach(cleanup)

describe('StudentModulePage', () => {
  it('renders header with title, description, and breadcrumbs', async () => {
    renderModulePage()
    expect(await screen.findByRole('heading', { name: 'Cellular Biology Basics' })).toBeInTheDocument()
    expect(screen.getByText('Introduction to cell organelles and membrane transport')).toBeInTheDocument()
    expect(screen.getAllByText('Biology 101').length).toBeGreaterThan(0)

    const backLinks = screen.getAllByRole('link', { name: /Back to class|Biology 101/i })
    expect(backLinks.length).toBeGreaterThan(0)
  })

  it('renders resources in order with text, drive embed, youtube embed, and external link with proper iframe attributes', async () => {
    renderModulePage()
    expect(await screen.findByRole('heading', { name: 'Study Guidelines' })).toBeInTheDocument()
    expect(screen.getByText('Read through the slides before attempting the practice quiz.')).toBeInTheDocument()

    // Drive resource
    expect(screen.getByRole('heading', { name: 'Organelles Presentation' })).toBeInTheDocument()
    const driveFrame = screen.getByTitle('Organelles Presentation preview')
    expect(driveFrame).toHaveAttribute('src', 'https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/preview')
    expect(driveFrame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation')
    expect(driveFrame).toHaveAttribute('allow', 'fullscreen')
    expect(driveFrame).toHaveAttribute('allowfullscreen')
    const driveLink = screen.getByRole('link', { name: 'Open in Drive' })
    expect(driveLink).toHaveAttribute('href', 'https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view')
    expect(driveLink).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByText('Preview not loading? Sign in with the Google account your instructor shared this with, or ask them to share the file.')).toBeInTheDocument()

    // YouTube resource
    expect(screen.getByRole('heading', { name: 'Membrane Transport Video' })).toBeInTheDocument()
    const youtubeFrame = screen.getByTitle('Membrane Transport Video preview')
    expect(youtubeFrame).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(youtubeFrame).toHaveAttribute('allow', 'fullscreen')
    expect(youtubeFrame).toHaveAttribute('allowfullscreen')
    const youtubeLink = screen.getByRole('link', { name: 'Open on YouTube' })
    expect(youtubeLink).toHaveAttribute('rel', 'noopener noreferrer')

    // Link resource
    expect(screen.getByRole('heading', { name: 'Cell Biology Reference Portal' })).toBeInTheDocument()
    const externalLink = screen.getByRole('link', { name: 'Open link' })
    expect(externalLink).toHaveAttribute('href', 'https://example.org/cell-biology')
    expect(externalLink).toHaveAttribute('target', '_blank')
    expect(externalLink).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders different icons for each Drive kind (file, doc, sheet, slides), not video', async () => {
    const driveResources: ModuleResourceWithId[] = [
      { id: 'r1', type: 'drive', title: 'Generic File', driveKind: 'file', driveFileId: '1234567890', order: 0, createdAt: now, updatedAt: now },
      { id: 'r2', type: 'drive', title: 'Study Doc', driveKind: 'doc', driveFileId: '1234567891', order: 1, createdAt: now, updatedAt: now },
      { id: 'r3', type: 'drive', title: 'Data Sheet', driveKind: 'sheet', driveFileId: '1234567892', order: 2, createdAt: now, updatedAt: now },
      { id: 'r4', type: 'drive', title: 'Slide Deck', driveKind: 'slides', driveFileId: '1234567893', order: 3, createdAt: now, updatedAt: now },
    ]
    mocks.subscribeToResources.mockImplementation((_cId: string, _mId: string, onChange: (items: ModuleResourceWithId[]) => void) => {
      onChange(driveResources)
      return () => undefined
    })

    renderModulePage()
    expect(await screen.findByRole('heading', { name: 'Generic File' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Study Doc' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Data Sheet' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Slide Deck' })).toBeInTheDocument()
    // None should render video icon
    expect(document.querySelector('.lucide-file-video')).not.toBeInTheDocument()
  })

  it('filters attached quizzes silently: shows published quizzes and hides unpublished or deleted ones without leaking titles', async () => {
    mocks.watchPublishedQuizzes.mockImplementation((_cId: string, onChange: (items: QuizRecord[]) => void) => {
      onChange([publishedQuiz, draftQuiz])
      return () => undefined
    })

    renderModulePage()
    expect(await screen.findByRole('heading', { name: 'Cell Structure Quiz' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start quiz' })).toHaveAttribute('href', '/student/quizzes/quiz-pub')

    // Verify draft / unpublished quiz and deleted quiz are NEVER leaked
    expect(screen.queryByText('Secret Upcoming Exam')).not.toBeInTheDocument()
    expect(screen.queryByText('quiz-draft')).not.toBeInTheDocument()
    expect(screen.queryByText('quiz-deleted')).not.toBeInTheDocument()
    expect(screen.queryByText(/Unavailable quiz/i)).not.toBeInTheDocument()
  })

  it('shows friendly no longer available state with NO Retry button when module is confirmed missing or unpublished', async () => {
    let notifyModule: (val: ModuleWithId | null) => void = () => undefined
    mocks.subscribeToModule.mockImplementation((_cId: string, _mId: string, onChange: (val: ModuleWithId | null) => void) => {
      notifyModule = onChange
      onChange(moduleRecord)
      return () => undefined
    })

    renderModulePage()
    expect(await screen.findByRole('heading', { name: 'Cellular Biology Basics' })).toBeInTheDocument()

    // Instructor unpublishes the module (confirmed draft status)
    notifyModule({ ...moduleRecord, status: 'draft' })

    expect(await screen.findByRole('heading', { name: 'Module no longer available' })).toBeInTheDocument()
    expect(screen.getByText(/This module has been unpublished or removed/i)).toBeInTheDocument()
    // Crucial: NO Retry button on confirmed unavailable
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    const backBtn = screen.getAllByRole('link', { name: /Back to class/i })
    expect(backBtn[0]).toHaveAttribute('href', '/student/classes/class-1')
  })

  it('shows error alert with Retry and neutral message when loading fails, NOT no longer available', async () => {
    mocks.subscribeToModule.mockImplementation((_cId: string, _mId: string, _onChange: unknown, onError: (err: Error) => void) => {
      onError(new Error('Network error loading module'))
      return () => undefined
    })

    renderModulePage()
    expect(await screen.findByRole('heading', { name: 'Module unavailable' })).toBeInTheDocument()
    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(within(alert).getByText("We couldn't load this module")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByText('Module no longer available')).not.toBeInTheDocument()
  })

  it('tracks resources loading separately: skeleton while loading, empty state only after empty snapshot, and error alert on failure', async () => {
    let notifyResources: (items: ModuleResourceWithId[]) => void = () => undefined
    let notifyError: (err: Error) => void = () => undefined
    mocks.subscribeToResources.mockImplementation((_cId: string, _mId: string, onChange: (items: ModuleResourceWithId[]) => void, onError: (err: Error) => void) => {
      notifyResources = onChange
      notifyError = onError
      return () => undefined
    })

    renderModulePage()
    expect(await screen.findByRole('heading', { name: 'Cellular Biology Basics' })).toBeInTheDocument()

    // While loading, skeleton is shown, empty state is NOT shown
    expect(screen.getAllByRole('status', { name: 'Loading module resources' }).length).toBeGreaterThan(0)
    expect(screen.queryByText('No resources in this module')).not.toBeInTheDocument()

    // Snapshot arrives with 0 items -> empty state is shown
    notifyResources([])
    expect(await screen.findByText('No resources in this module')).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Loading module resources' })).not.toBeInTheDocument()

    // When resources fail to load -> error alert with Retry
    notifyError(new Error('Failed to load resources'))
    expect(await screen.findByText('Failed to load resources')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByText('No resources in this module')).not.toBeInTheDocument()
  })

  it('shows small inline note with Retry when attached quizzes fail to load', async () => {
    mocks.watchPublishedQuizzes.mockImplementation((_cId: string, _onChange: unknown, onError: (err: Error) => void) => {
      onError(new Error('Failed to fetch class quizzes'))
      return () => undefined
    })

    renderModulePage()
    expect(await screen.findByRole('heading', { name: 'Cellular Biology Basics' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Attached quizzes' })).toBeInTheDocument()
    expect(screen.getByText("We couldn't load attached quizzes.")).toBeInTheDocument()
    const retryBtn = screen.getByRole('button', { name: 'Retry' })
    expect(retryBtn).toBeInTheDocument()
    fireEvent.click(retryBtn)
    expect(mocks.watchPublishedQuizzes).toHaveBeenCalledTimes(2)
  })
})
