import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SharedItemsTabContent } from './SharedItemsTabContent'
import type { SharedGroupItem } from '../types'

describe('SharedItemsTabContent', () => {
  afterEach(cleanup)

  const mockItems: SharedGroupItem[] = [
    {
      id: 'item-1',
      kind: 'canvas',
      title: 'Cellular Respiration Flow',
      summary: 'Glycolysis through ETC',
      sharedByUid: 'bob',
      sharedByName: 'Bob',
      sharedAt: { toMillis: () => 1000 } as any,
      version: 1,
      payload: {
        nodeCount: 5,
        edgeCount: 4,
        nodes: [],
        edges: [],
      },
    },
  ]

  it('renders item list with view, copy, and remove actions', () => {
    const handleView = vi.fn()
    const handleCopy = vi.fn().mockResolvedValue(undefined)
    const handleRemove = vi.fn()
    const handleUpdate = vi.fn().mockResolvedValue(undefined)

    render(
      <SharedItemsTabContent
        kind="canvas"
        items={mockItems}
        loading={false}
        error={null}
        onRetry={() => {}}
        onOpenShare={() => {}}
        onViewItem={handleView}
        onSaveCopy={handleCopy}
        onUpdateItem={handleUpdate}
        onRemoveItem={handleRemove}
        isOwner={true}
        currentUid="alice"
      />,
    )

    expect(screen.getByText('Cellular Respiration Flow')).toBeTruthy()
    expect(screen.getByText('Shared by Bob')).toBeTruthy()
    expect(screen.getByText('5 nodes')).toBeTruthy()

    const viewBtn = screen.getByRole('button', { name: /view/i })
    fireEvent.click(viewBtn)
    expect(handleView).toHaveBeenCalledWith(mockItems[0])

    const copyBtn = screen.getByRole('button', { name: /save a copy/i })
    fireEvent.click(copyBtn)
    expect(handleCopy).toHaveBeenCalledWith(mockItems[0])

    const removeBtn = screen.getByRole('button', { name: /remove cellular respiration flow from group/i })
    fireEvent.click(removeBtn)
    expect(handleRemove).toHaveBeenCalledWith(mockItems[0])
  })

  it('renders empty state when there are no items', () => {
    const handleOpenShare = vi.fn()
    render(
      <SharedItemsTabContent
        kind="note"
        items={[]}
        loading={false}
        error={null}
        onRetry={() => {}}
        onOpenShare={handleOpenShare}
        onViewItem={() => {}}
        onSaveCopy={vi.fn().mockResolvedValue(undefined)}
        onUpdateItem={vi.fn().mockResolvedValue(undefined)}
        onRemoveItem={() => {}}
        isOwner={false}
      />,
    )

    expect(screen.getByText(/no shared notes yet/i)).toBeTruthy()
    const shareBtn = screen.getByRole('button', { name: /share first note/i })
    fireEvent.click(shareBtn)
    expect(handleOpenShare).toHaveBeenCalled()
  })

  it('renders error state with retry button', () => {
    const handleRetry = vi.fn()
    render(
      <SharedItemsTabContent
        kind="lessonPlan"
        items={[]}
        loading={false}
        error="Network timeout"
        onRetry={handleRetry}
        onOpenShare={() => {}}
        onViewItem={() => {}}
        onSaveCopy={vi.fn().mockResolvedValue(undefined)}
        onUpdateItem={vi.fn().mockResolvedValue(undefined)}
        onRemoveItem={() => {}}
        isOwner={false}
      />,
    )

    expect(screen.getByText(/shared lesson plans couldn't load/i)).toBeTruthy()
    expect(screen.getByText(/network timeout/i)).toBeTruthy()
    const retryBtn = screen.getByRole('button', { name: /retry/i })
    fireEvent.click(retryBtn)
    expect(handleRetry).toHaveBeenCalled()
  })
})
