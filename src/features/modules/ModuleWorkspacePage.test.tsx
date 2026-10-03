import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModuleWorkspacePage } from './ModuleWorkspacePage'

const mocks = vi.hoisted(() => ({
  module: null as Record<string, unknown> | null,
  resources: [] as Array<Record<string, unknown>>,
  updateModule: vi.fn(async () => undefined),
  publishModule: vi.fn(async () => undefined),
}))
vi.mock('../../app/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('../classes/services/classService', () => ({ watchClass: (_id: string, onChange: (value: unknown) => void) => { onChange(classroom); return () => undefined } }))
vi.mock('./services', () => ({
  subscribeToModules: (_classId: string, _role: string, onChange: (items: unknown[]) => void) => { onChange(mocks.module ? [mocks.module] : []); return () => undefined },
  subscribeToResources: (_classId: string, _moduleId: string, onChange: (items: unknown[]) => void) => { onChange(mocks.resources); return () => undefined },
  updateModule: mocks.updateModule,
  publishModule: mocks.publishModule,
  unpublishModule: vi.fn(async () => undefined),
  addResource: vi.fn(async () => 'new-resource'),
  deleteResource: vi.fn(async () => undefined),
  reorderResources: vi.fn(async () => undefined),
  updateResource: vi.fn(async () => undefined),
}))
vi.mock('./AttachedQuizzesSection', () => ({ AttachedQuizzesSection: () => <section aria-label="Attached quizzes" /> }))
vi.mock('../../shared/ui/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }))

const now = Timestamp.fromMillis(1)
const classroom = { id: 'class-1', ownerId: 'teacher', ownerName: 'Teacher', name: 'Biology', section: '', subject: '', description: '', joinCode: 'ABC234', joinEnabled: true, requireApproval: false, status: 'active', accent: 'pinstripe', createdAt: now, updatedAt: now, codeRotatedAt: now }
const mod = { id: 'module-1', classId: 'class-1', ownerId: 'teacher', title: 'Cell structure', description: 'Intro', order: 0, status: 'draft', quizIds: [], resourceCount: 0, createdAt: now, updatedAt: now, publishedAt: null }

function renderPage() {
  return render(<MemoryRouter initialEntries={['/instructor/classes/class-1/modules/module-1']}><Routes><Route path="/instructor/classes/:classId/modules/:moduleId" element={<ModuleWorkspacePage />} /></Routes></MemoryRouter>)
}
afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.module = mod; mocks.resources = [] })

describe('module workspace', () => {
  it('autosaves title edits and reports the saved state', async () => {
    mocks.module = mod
    renderPage()
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Cell structure revised' } })
    expect(screen.getByRole('status')).toHaveTextContent('Saving…')
    await waitFor(() => expect(mocks.updateModule).toHaveBeenCalledWith('class-1', 'module-1', { title: 'Cell structure revised', description: 'Intro' }), { timeout: 3000 })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('All changes saved'))
  })

  it('keeps Publish disabled until a title and content are present', async () => {
    mocks.module = { ...mod, title: '' }
    const view = renderPage()
    const publish = await screen.findByRole('button', { name: 'Publish' })
    expect(publish).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Ready module' } })
    expect(publish).toBeDisabled()
    mocks.module = { ...mod, title: 'Ready module' }
    mocks.resources = [{ id: 'resource-1', type: 'text', title: 'Notes', body: 'Lesson', order: 0, createdAt: now, updatedAt: now }]
    // Resource subscriptions are live; mount again to model the received snapshot.
    view.unmount()
    renderPage()
    expect(await screen.findByRole('button', { name: 'Publish' })).toBeEnabled()
  })
})
