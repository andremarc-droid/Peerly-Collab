import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClassWithId } from '../classes/types'
import { ModulesTab } from './ModulesTab'

const mocks = vi.hoisted(() => ({
  items: [] as Array<Record<string, unknown>>,
  create: vi.fn(async () => 'new-id'),
  reorder: vi.fn(async () => undefined),
  error: null as Error | null,
}))
vi.mock('./services', () => ({
  createModule: mocks.create,
  deleteModuleCascade: vi.fn(async () => undefined),
  duplicateModule: vi.fn(async () => 'copy-id'),
  publishModule: vi.fn(async () => undefined),
  unpublishModule: vi.fn(async () => undefined),
  reorderModules: mocks.reorder,
  subscribeToModules: (_classId: string, _role: string, onChange: (items: unknown[]) => void, onError?: (err: Error) => void) => {
    if (mocks.error) onError?.(mocks.error)
    else onChange(mocks.items)
    return () => undefined
  },
}))
vi.mock('../../shared/ui/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }))

const now = Timestamp.fromMillis(1000)
const classroom: ClassWithId = { id: 'class-1', ownerId: 'teacher', ownerName: 'Teacher', name: 'Biology', section: '', subject: '', description: '', joinCode: 'ABC234', joinEnabled: true, requireApproval: false, status: 'active', accent: 'pinstripe', createdAt: now, updatedAt: now, codeRotatedAt: now }
const moduleItem = (id: string, order: number) => ({ id, classId: classroom.id, ownerId: classroom.ownerId, title: 'Module ' + (order + 1), description: 'A short lesson', order, status: 'draft', quizIds: [], resourceCount: 1, createdAt: now, updatedAt: now, publishedAt: null })
function LocationText() { const location = useLocation(); return <p>{location.pathname + location.search}</p> }
function renderTab() { return render(<MemoryRouter initialEntries={['/instructor/classes/class-1?tab=modules']}><Routes><Route path="/instructor/classes/class-1" element={<ModulesTab classroom={classroom} />} /><Route path="/instructor/classes/class-1/modules/:moduleId" element={<LocationText />} /></Routes></MemoryRouter>) }

afterEach(() => { vi.clearAllMocks(); mocks.items = []; mocks.error = null })
afterEach(cleanup)

describe('instructor modules list', () => {
  it('creates the first module and navigates to its workspace with resource focus', async () => {
    renderTab()
    fireEvent.click(await screen.findByRole('button', { name: 'Create your first module' }))
    fireEvent.change(screen.getByLabelText('Module title'), { target: { value: 'Unit one' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create module' }))
    expect(await screen.findByText('/instructor/classes/class-1/modules/new-id?focus=add-resource')).toBeInTheDocument()
    expect(mocks.create).toHaveBeenCalledWith('class-1', 'teacher', 'Unit one')
  })
  it('shows ordered cards and keyboard reorder actions in the More menu', async () => {
    mocks.items = [moduleItem('one', 0), moduleItem('two', 1)]
    renderTab()
    expect(await screen.findByRole('link', { name: 'Open module Module 1' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Module 1' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move down' }))
    await waitFor(() => expect(mocks.reorder).toHaveBeenCalledWith('class-1', ['two', 'one']))
  })

  it('explains that deleting a module does not delete its Google Drive files', async () => {
    mocks.items = [moduleItem('one', 0)]
    renderTab()
    fireEvent.click(await screen.findByRole('button', { name: 'More actions for Module 1' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Google Drive files themselves are not deleted/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Delete module' })).toBeInTheDocument()
  })

  it('shows only the error alert and not the empty state when loading modules fails', async () => {
    mocks.error = new Error('Missing or insufficient permissions.')
    renderTab()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Modules unavailable')).toBeInTheDocument()
    expect(screen.getByText('Missing or insufficient permissions.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByText('Start with a module')).not.toBeInTheDocument()
  })
})
