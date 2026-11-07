import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReactFlowProvider, useStoreApi, type NodeProps } from '@xyflow/react'
import { LearningCanvas } from './LearningCanvas'
import { QuickAddMenu } from './QuickAddMenu'
import {
  TextCard,
  clearUnsavedTextDrafts,
  getUnsavedTextDraft,
  type TextCardData,
} from './TextCard'
import { ExpandableCanvasContainer } from '../../canvas/components/ExpandableCanvasContainer'
import type { LearningCanvasContent } from '../types'

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver)
})

afterEach(() => {
  cleanup()
  clearUnsavedTextDrafts()
  vi.unstubAllGlobals()
})

const sampleContent: LearningCanvasContent = {
  version: 1,
  nodes: [
    {
      id: 'node-1',
      type: 'text',
      x: 50,
      y: 50,
      width: 240,
      height: 140,
      color: 'none',
      text: 'First card',
    },
    {
      id: 'node-2',
      type: 'text',
      x: 350,
      y: 50,
      width: 240,
      height: 140,
      color: 'tint',
      text: 'Second card',
    },
  ],
  edges: [
    {
      id: 'edge-1',
      from: 'node-1',
      to: 'node-2',
      arrow: 'to',
    },
  ],
  viewport: { x: 0, y: 0, zoom: 1 },
}

function ZoomHarness({
  initialZoom,
  onStoreReady,
  children,
}: {
  initialZoom: number
  onStoreReady?: (setZoom: (z: number) => void) => void
  children: React.ReactNode
}) {
  const store = useStoreApi()
  const initializedRef = { current: false }
  if (!initializedRef.current) {
    initializedRef.current = true
    store.setState({ transform: [0, 0, initialZoom] })
    onStoreReady?.((z: number) => {
      store.setState({ transform: [0, 0, z] })
    })
  }
  return <>{children}</>
}

function makeTextCardProps(overrides?: Partial<NodeProps & { data: TextCardData }>): NodeProps & { data: TextCardData } {
  return {
    id: 'tc-1',
    type: 'text',
    data: {
      text: 'Sample markdown text',
      color: 'none',
      readOnly: false,
    },
    selected: false,
    isConnectable: true,
    zIndex: 0,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    dragging: false,
    draggable: true,
    selectable: true,
    deletable: true,
    ...overrides,
  }
}

describe('LearningCanvas component rendering', () => {
  it('renders the canvas root container, toolbar, and board', () => {
    render(
      <div className="w-[800px] h-[600px]">
        <LearningCanvas
          title="Test Board"
          initialContent={sampleContent}
        />
      </div>,
    )
    expect(screen.getByTestId('learning-canvas-root')).not.toBeNull()
    expect(screen.getByTestId('learning-canvas-board')).not.toBeNull()
    expect(screen.getByRole('toolbar', { name: 'Learning canvas whiteboard tools' })).not.toBeNull()
  })

  it('renders cards in non-test or test environment without being culled', () => {
    render(
      <div className="w-[800px] h-[600px]">
        <LearningCanvas
          title="Test Board"
          initialContent={sampleContent}
        />
      </div>,
    )
    expect(screen.getByTestId('text-card-node-1')).not.toBeNull()
    expect(screen.getByTestId('text-card-node-2')).not.toBeNull()
  })
})

describe('TextCard low-detail (LOD) handle retention', () => {
  it('renders all 4 connection handles when zoom < 0.5 and card is unselected', () => {
    render(
      <ReactFlowProvider>
        <ZoomHarness initialZoom={0.35}>
          <TextCard {...makeTextCardProps({ selected: false })} />
        </ZoomHarness>
      </ReactFlowProvider>,
    )

    const card = screen.getByTestId('text-card-tc-1')
    expect(card.classList.contains('learning-card--lod')).toBe(true)

    const handles = card.querySelectorAll('.canvas-handle')
    expect(handles.length).toBe(4)
    expect(card.querySelector('[data-handleid="top"]')).not.toBeNull()
    expect(card.querySelector('[data-handleid="right"]')).not.toBeNull()
    expect(card.querySelector('[data-handleid="bottom"]')).not.toBeNull()
    expect(card.querySelector('[data-handleid="left"]')).not.toBeNull()
  })

  it('does not remove handle DOM nodes when crossing the 0.5 LOD zoom threshold', () => {
    let setZoom: (z: number) => void = () => {}
    render(
      <ReactFlowProvider>
        <ZoomHarness
          initialZoom={1}
          onStoreReady={(fn) => {
            setZoom = fn
          }}
        >
          <TextCard {...makeTextCardProps({ selected: false })} />
        </ZoomHarness>
      </ReactFlowProvider>,
    )

    const card = screen.getByTestId('text-card-tc-1')
    expect(card.classList.contains('learning-card--lod')).toBe(false)
    const initialHandles = Array.from(card.querySelectorAll('.canvas-handle'))
    expect(initialHandles.length).toBe(4)

    // Cross below 0.5 zoom into low-detail mode
    act(() => {
      setZoom(0.3)
    })
    expect(card.classList.contains('learning-card--lod')).toBe(true)
    const lodHandles = Array.from(card.querySelectorAll('.canvas-handle'))
    expect(lodHandles.length).toBe(4)
    // Verify the exact same DOM elements remain mounted
    lodHandles.forEach((handle, idx) => {
      expect(handle).toBe(initialHandles[idx])
    })

    // Cross back above 0.5 zoom
    act(() => {
      setZoom(1)
    })
    expect(card.classList.contains('learning-card--lod')).toBe(false)
    const restoredHandles = Array.from(card.querySelectorAll('.canvas-handle'))
    expect(restoredHandles.length).toBe(4)
    restoredHandles.forEach((handle, idx) => {
      expect(handle).toBe(initialHandles[idx])
    })
  })
})

describe('toSavableContent dropped item warning in LearningCanvas', () => {
  it('shows a visible warning notice when saving drops an incomplete card and its connected edge', async () => {
    const onSave = vi.fn().mockImplementation(async (c: LearningCanvasContent) => c)
    const boardWithIncompleteLink: LearningCanvasContent = {
      version: 1,
      nodes: [
        {
          id: 'node-1',
          type: 'text',
          x: 50,
          y: 50,
          width: 240,
          height: 140,
          color: 'none',
          text: 'Valid text card',
        },
        {
          id: 'node-incomplete',
          type: 'link',
          x: 350,
          y: 50,
          width: 240,
          height: 140,
          color: 'none',
          link: { url: 'https://example.com', title: '' },
        },
      ],
      edges: [
        {
          id: 'edge-dropped',
          from: 'node-1',
          to: 'node-incomplete',
          arrow: 'to',
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    }

    render(
      <div className="w-[800px] h-[600px]">
        <LearningCanvas
          title="Save Warning Board"
          initialContent={boardWithIncompleteLink}
          onSave={onSave}
        />
      </div>,
    )

    // Trigger an edit so the board is dirty and Save canvas is enabled
    fireEvent.click(screen.getByRole('button', { name: 'Text' }))
    const saveBtn = screen.getByRole('button', { name: 'Save canvas' })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      const notice = screen.getByTestId('connection-notice')
      expect(notice.textContent).toContain('1 incomplete card(s) and 1 connected edge(s) were skipped during save')
    })
  })
})

describe('QuickAddMenu positioning and wrapper containment', () => {
  it('renders QuickAddMenu inline inside the canvas container so it stays visible in fullscreen and does not set contain:paint on wrapper', async () => {
    const css = readFileSync(resolve(__dirname, '../learningCanvas.css'), 'utf8')
    const wrapperRuleMatch = css.match(/\.learning-canvas-wrapper\s*\{[^}]*\}/)
    expect(wrapperRuleMatch).not.toBeNull()
    expect(wrapperRuleMatch?.[0]).not.toMatch(/contain\s*:\s*paint/)

    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(
      <ExpandableCanvasContainer title="Fullscreen Test">
        <div className="learning-canvas-wrapper" data-testid="wrapper-host">
          <QuickAddMenu position={{ x: 320, y: 410 }} onSelect={onSelect} onClose={onClose} />
        </div>
      </ExpandableCanvasContainer>,
    )

    const expandableContainer = screen.getByTestId('expandable-canvas-container')
    const wrapperHost = screen.getByTestId('wrapper-host')
    const menu = screen.getByTestId('quick-add-menu')

    expect(expandableContainer.contains(menu)).toBe(true)
    expect(wrapperHost.contains(menu)).toBe(true)
    expect(menu.style.left).toBe('320px')
    expect(menu.style.top).toBe('410px')

    // Expand to fullscreen state and verify QuickAddMenu remains inside the fullscreen subtree and positioned
    fireEvent.click(screen.getByRole('button', { name: 'Expand board to full screen' }))
    await waitFor(() => {
      expect(expandableContainer.getAttribute('data-expanded')).toBe('true')
    })

    const expandedMenu = screen.getByTestId('quick-add-menu')
    expect(expandableContainer.contains(expandedMenu)).toBe(true)
    expect(wrapperHost.contains(expandedMenu)).toBe(true)
    expect(expandedMenu.style.left).toBe('320px')
    expect(expandedMenu.style.top).toBe('410px')

    fireEvent.click(screen.getByRole('menuitem', { name: /Text card/i }))
    expect(onSelect).toHaveBeenCalledWith('text')
  })
})

describe('TextCard inline editing state retention across culling unmount/remount', () => {
  it('preserves unsaved editText and editing mode if unmounted while culled and notifies onEditingChange', () => {
    const onEditingChange = vi.fn()
    const onUpdate = vi.fn()
    const props = makeTextCardProps({
      id: 'tc-cull-1',
      data: {
        text: 'Original text',
        color: 'none',
        readOnly: false,
        onEditingChange,
        onUpdate,
      },
    })

    const { unmount } = render(
      <ReactFlowProvider>
        <TextCard {...props} />
      </ReactFlowProvider>,
    )

    // Enter inline editing mode via double-click
    fireEvent.doubleClick(screen.getByTestId('text-card-tc-cull-1'))
    expect(onEditingChange).toHaveBeenCalledWith('tc-cull-1', true)

    const textarea = screen.getByLabelText('Edit text content (Markdown supported)') as HTMLTextAreaElement
    expect(textarea.value).toBe('Original text')

    // Type unsaved text
    fireEvent.change(textarea, { target: { value: 'Unsaved in-progress markdown draft' } })
    expect(textarea.value).toBe('Unsaved in-progress markdown draft')

    // Simulate viewport culling unmounting the card when panned off-screen
    unmount()
    onEditingChange.mockClear()

    // Remount the same card when panned back into view
    render(
      <ReactFlowProvider>
        <TextCard {...props} />
      </ReactFlowProvider>,
    )

    // Re-fires onEditingChange(id, true) when remounting with an active draft
    expect(onEditingChange).toHaveBeenCalledWith('tc-cull-1', true)

    const restoredTextarea = screen.getByLabelText('Edit text content (Markdown supported)') as HTMLTextAreaElement
    expect(restoredTextarea.value).toBe('Unsaved in-progress markdown draft')

    // Saving commits the draft and clears the unsaved cache
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onUpdate).toHaveBeenCalledWith('tc-cull-1', { text: 'Unsaved in-progress markdown draft' })
    expect(onEditingChange).toHaveBeenCalledWith('tc-cull-1', false)
  })

  it('isolates unsaved drafts by canvasId + nodeId so two canvases with the same nodeId never collide', () => {
    const propsCanvasA = makeTextCardProps({
      id: 'node-shared',
      data: {
        text: 'Canvas A text',
        color: 'none',
        canvasId: 'canvas-a',
        readOnly: false,
      },
    })
    const propsCanvasB = makeTextCardProps({
      id: 'node-shared',
      data: {
        text: 'Canvas B text',
        color: 'none',
        canvasId: 'canvas-b',
        readOnly: false,
      },
    })

    const { unmount } = render(
      <ReactFlowProvider>
        <TextCard {...propsCanvasA} />
      </ReactFlowProvider>,
    )

    fireEvent.doubleClick(screen.getByTestId('text-card-node-shared'))
    const textareaA = screen.getByLabelText('Edit text content (Markdown supported)') as HTMLTextAreaElement
    fireEvent.change(textareaA, { target: { value: 'Draft on Canvas A' } })
    expect(getUnsavedTextDraft('node-shared', 'canvas-a')).toBe('Draft on Canvas A')
    expect(getUnsavedTextDraft('node-shared', 'canvas-b')).toBeUndefined()

    unmount()

    // Rendering the same nodeId in canvas-b does not inherit canvas-a's draft
    render(
      <ReactFlowProvider>
        <TextCard {...propsCanvasB} />
      </ReactFlowProvider>,
    )
    expect(screen.queryByLabelText('Edit text content (Markdown supported)')).toBeNull()
    expect(screen.getByTestId('text-card-node-shared').textContent).toContain('Canvas B text')
  })

  it('clears unsaved drafts when a card is deleted and when LearningCanvas unmounts', async () => {
    const { unmount } = render(
      <div className="w-[800px] h-[600px]">
        <LearningCanvas
          canvasId="canvas-cleanup-test"
          title="Cleanup Board"
          initialContent={sampleContent}
        />
      </div>,
    )

    // Start editing node-1 and node-2
    fireEvent.doubleClick(screen.getByTestId('text-card-node-1'))
    fireEvent.doubleClick(screen.getByTestId('text-card-node-2'))

    const textareas = screen.getAllByLabelText('Edit text content (Markdown supported)') as HTMLTextAreaElement[]
    fireEvent.change(textareas[0]!, { target: { value: 'Draft 1 to delete' } })
    fireEvent.change(textareas[1]!, { target: { value: 'Draft 2 to clear on unmount' } })

    expect(getUnsavedTextDraft('node-1', 'canvas-cleanup-test')).toBe('Draft 1 to delete')
    expect(getUnsavedTextDraft('node-2', 'canvas-cleanup-test')).toBe('Draft 2 to clear on unmount')

    // Delete node-1 via Outline view and verify its draft is removed immediately
    fireEvent.click(screen.getByRole('button', { name: /Outline/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete First card' }))

    await waitFor(() => {
      expect(screen.queryByTestId('text-card-node-1')).toBeNull()
    })
    expect(getUnsavedTextDraft('node-1', 'canvas-cleanup-test')).toBeUndefined()
    expect(getUnsavedTextDraft('node-2', 'canvas-cleanup-test')).toBe('Draft 2 to clear on unmount')

    // Unmount LearningCanvas and verify remaining drafts for canvas-cleanup-test are cleared
    unmount()
    expect(getUnsavedTextDraft('node-2', 'canvas-cleanup-test')).toBeUndefined()
  })
})

describe('LinkCard incomplete default URL guard', () => {
  it('renders a newly added Link card (url: "https://", title: "") without throwing Invalid URL', () => {
    render(
      <div className="w-[800px] h-[600px]">
        <LearningCanvas
          title="Link Card Guard Board"
          initialContent={sampleContent}
        />
      </div>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Link' }))
    const linkCard = screen.getByLabelText('Link card: Web Link')
    expect(linkCard).not.toBeNull()
    expect(linkCard.textContent).toContain('Web Link')
  })
})