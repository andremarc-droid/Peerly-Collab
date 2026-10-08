import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { SharedGraphRef } from './sharing'
import { SharedGraphList } from './SharedGraphList'

const mocks = vi.hoisted(() => ({
  owned: [] as SharedGraphRef[],
  shared: [] as SharedGraphRef[],
  deleteSharedGraph: vi.fn(),
  showToast: vi.fn(),
}))

vi.mock('./sharing', () => ({
  watchOwnedGraphs: (_uid: string, _classIds: string[], onChange: (items: SharedGraphRef[]) => void) => {
    onChange(mocks.owned)
    return vi.fn()
  },
  watchSharedGraphs: (_uid: string, onChange: (items: SharedGraphRef[]) => void) => {
    onChange(mocks.shared)
    return vi.fn()
  },
}))
vi.mock('./deleteSharedGraph', () => ({ deleteSharedGraph: mocks.deleteSharedGraph }))
vi.mock('../../../shared/ui/useToast', () => ({ useToast: () => ({ showToast: mocks.showToast }) }))

const ownedGraph: SharedGraphRef = {
  id: 'graph-1',
  ownerId: 'teacher',
  ownerName: 'Teacher',
  classId: 'class-1',
  title: 'Biology concepts',
  nodeIds: ['note:one', 'module:one'],
  positions: {},
  nodes: [],
  links: [],
  role: 'owner',
}
const viewerGraph: SharedGraphRef = { ...ownedGraph, id: 'graph-2', title: 'Shared study view', role: 'viewer', ownerId: 'other', ownerName: 'Morgan' }

function renderList(activeGraphId: string | null = null) {
  return render(
    <MemoryRouter initialEntries={['/?tab=graph&classId=class-1']}>
      <SharedGraphList uid="teacher" selectedClassId="all" classIds={['class-1']} activeGraphId={activeGraphId} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.owned = [ownedGraph]
  mocks.shared = [viewerGraph]
  mocks.deleteSharedGraph.mockResolvedValue(undefined)
})

afterEach(cleanup)

describe('SharedGraphList', () => {
  it('shows saved graph views as redesigned cards with ownership and current-view status', () => {
    renderList('graph-1')

    expect(screen.getByRole('heading', { name: 'Biology concepts' })).toBeInTheDocument()
    expect(screen.getByText('2 items · Saved by you')).toBeInTheDocument()
    expect(screen.getByText('Open now')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Biology concepts' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Open graph' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete Shared study view' })).not.toBeInTheDocument()
  })

  it('restricts deletion to owners and confirms before calling the server', async () => {
    renderList()

    expect(screen.queryByRole('button', { name: 'Delete Shared study view' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Biology concepts' }))
    expect(screen.getByRole('dialog', { name: 'Delete this graph view?' })).toBeInTheDocument()
    expect(mocks.deleteSharedGraph).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Type Biology concepts to confirm'), { target: { value: 'Biology concepts' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete graph view' }))

    await waitFor(() => expect(mocks.deleteSharedGraph).toHaveBeenCalledWith('class-1', 'graph-1'))
    expect(mocks.showToast).toHaveBeenCalledWith('success', '“Biology concepts” was deleted.')
  })

  it('keeps the confirmation open and reports server deletion errors', async () => {
    mocks.deleteSharedGraph.mockRejectedValue(new Error('Function unavailable'))
    renderList()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Biology concepts' }))
    fireEvent.change(screen.getByLabelText('Type Biology concepts to confirm'), { target: { value: 'Biology concepts' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete graph view' }))

    expect(await screen.findByText('Function unavailable')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Delete this graph view?' })).toBeInTheDocument()
  })
})
