import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { AddFileButtons } from './AddFileButtons'
import { FileList } from './FileList'
import { StudentTurnIn } from './StudentTurnIn'
import type { AssignmentWithId, DriveFile, TurnInWithId } from './types'
import type { GoogleDriveApi } from './useGoogleDrive'

const mocks = vi.hoisted(() => ({ submitTurnIn: vi.fn(), withdrawTurnIn: vi.fn(), showToast: vi.fn() }))
vi.mock('./services', () => ({ submitTurnIn: mocks.submitTurnIn, withdrawTurnIn: mocks.withdrawTurnIn }))
vi.mock('../../shared/ui/useToast', () => ({ useToast: () => ({ showToast: mocks.showToast }) }))

const file: DriveFile = { fileId: 'abcdefghij1234', name: 'Essay.pdf', mimeType: 'application/pdf', kind: 'file', url: 'https://drive.google.com/file/d/abcdefghij1234/view' }

function makeDrive(overrides: Partial<GoogleDriveApi> = {}): GoogleDriveApi {
  return {
    configIssue: null,
    busy: false,
    connect: vi.fn(),
    hasSession: vi.fn(() => false),
    pick: vi.fn(async () => [file]),
    upload: vi.fn(),
    shareWithAnyone: vi.fn(async () => []),
    shareWithUser: vi.fn(async () => undefined),
    ...overrides,
  }
}

const assignment = {
  id: 'a1', classId: 'c1', ownerId: 'teacher', title: 'Essay', instructions: '', status: 'published', dueAt: null, points: 100,
  acceptsTurnIn: true, collectorEmail: 'teacher@example.com', attachments: [], createdAt: Timestamp.fromMillis(1), updatedAt: Timestamp.fromMillis(1), publishedAt: Timestamp.fromMillis(1),
} as unknown as AssignmentWithId

beforeEach(() => { vi.clearAllMocks(); mocks.submitTurnIn.mockResolvedValue(undefined) })
afterEach(cleanup)

describe('AddFileButtons', () => {
  it('opens Google’s upload picker from a single click, even before Drive is connected', async () => {
    const drive = makeDrive()
    const onAdded = vi.fn()
    render(<AddFileButtons remaining={5} drive={drive} onAdded={onAdded} onError={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Upload from device/ }))
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith([file]))
    expect(drive.pick).toHaveBeenCalledWith(5, 'upload')
    expect(drive.connect).not.toHaveBeenCalled()
    expect(screen.queryByText(/again/i)).toBeNull()
  })

  it('opens the Drive browser for “Add from Google Drive”', async () => {
    const drive = makeDrive()
    render(<AddFileButtons remaining={2} drive={drive} onAdded={vi.fn()} onError={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Add from Google Drive/ }))
    await waitFor(() => expect(drive.pick).toHaveBeenCalledWith(2, 'browse'))
  })
})

describe('FileList preview', () => {
  it('shows and hides an inline Drive preview when enabled', () => {
    render(<FileList files={[file]} label="Assignment materials" preview />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview Essay.pdf' }))
    const frame = screen.getByTitle('Preview of Essay.pdf')
    expect(frame.getAttribute('src')).toBe('https://drive.google.com/file/d/abcdefghij1234/preview')
    fireEvent.click(screen.getByRole('button', { name: 'Hide preview of Essay.pdf' }))
    expect(screen.queryByTitle('Preview of Essay.pdf')).toBeNull()
  })

  it('offers no preview for a file id that is not a valid Drive id', () => {
    render(<FileList files={[{ ...file, fileId: 'bad id' }]} label="Assignment materials" preview />)
    expect(screen.queryByRole('button', { name: /Preview/ })).toBeNull()
  })

  it('has no preview button unless asked for', () => {
    render(<FileList files={[file]} label="Files" />)
    expect(screen.queryByRole('button', { name: /Preview/ })).toBeNull()
  })

  it('says when a turn-in has no files', () => {
    render(<FileList files={[]} label="Files" />)
    expect(screen.getByText('No files attached.')).toBeTruthy()
  })
})

describe('StudentTurnIn without files', () => {
  it('warns before turning in nothing, and goes back without submitting', () => {
    render(<StudentTurnIn assignment={assignment} turnIn={null} studentId="student" studentName="Sam" drive={makeDrive()} />)
    fireEvent.click(screen.getByRole('button', { name: /^Turn in$/ }))
    const dialog = screen.getByRole('dialog', { name: 'Turn in without any files?' })
    expect(within(dialog).getByText(/There’s no document attached for you to turn in. Are you sure you want to proceed\?/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Go back and add files' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.submitTurnIn).not.toHaveBeenCalled()
  })

  it('turns in with an empty file list after confirming, without asking Google to share anything', async () => {
    const drive = makeDrive()
    render(<StudentTurnIn assignment={assignment} turnIn={null} studentId="student" studentName="Sam" drive={drive} />)
    fireEvent.click(screen.getByRole('button', { name: /^Turn in$/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Turn in anyway' }))
    await waitFor(() => expect(mocks.submitTurnIn).toHaveBeenCalledWith(expect.objectContaining({ files: [] })))
    expect(drive.shareWithUser).not.toHaveBeenCalled()
    expect(mocks.showToast).toHaveBeenCalledWith('success', 'Turned in without any files.')
  })

  it('warns that earlier files will be replaced when turning in again with nothing', () => {
    const turnIn = { id: 'student', studentId: 'student', studentName: 'Sam', classId: 'c1', files: [file], turnedInAt: Timestamp.fromMillis(2), grade: null, feedback: '', gradedAt: null } as unknown as TurnInWithId
    render(<StudentTurnIn assignment={assignment} turnIn={turnIn} studentId="student" studentName="Sam" drive={makeDrive()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Replace files' }))
    fireEvent.click(screen.getByRole('button', { name: /Turn in again/ }))
    expect(within(screen.getByRole('dialog')).getByText(/replaces the files you turned in before/)).toBeTruthy()
  })

  it('turns in files straight away when some are attached', async () => {
    const drive = makeDrive()
    render(<StudentTurnIn assignment={assignment} turnIn={null} studentId="student" studentName="Sam" drive={drive} />)
    fireEvent.click(screen.getByRole('button', { name: /Upload from device/ }))
    expect(await screen.findByRole('list', { name: 'Files ready to turn in' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Turn in$/ }))
    await waitFor(() => expect(mocks.submitTurnIn).toHaveBeenCalledWith(expect.objectContaining({ files: [file] })))
    expect(drive.shareWithUser).toHaveBeenCalledWith([file], 'teacher@example.com')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
