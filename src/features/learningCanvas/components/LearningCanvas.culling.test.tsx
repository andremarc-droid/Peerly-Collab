import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReactFlowProvider, useStoreApi } from '@xyflow/react'
import { LearningCanvasInternal } from './LearningCanvas'
import { QuickAddMenu } from './QuickAddMenu'
import type { LearningCanvasContent } from '../types'

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const cullingBoard: LearningCanvasContent = {
  version: 1,
  nodes: [
    {
      id: 'node-img',
      type: 'image',
      x: 40,
      y: 60,
      width: 280,
      height: 220,
      color: 'none',
      image: {
        dataUrl: TINY_PNG,
        alt: 'Diagram image',
        caption: 'Architecture diagram',
      },
    },
    {
      id: 'node-text',
      type: 'text',
      x: 420,
      y: 80,
      width: 240,
      height: 140,
      color: 'tint',
      text: 'Connected explanation card',
    },
  ],
  edges: [
    {
      id: 'edge-img-text',
      from: 'node-img',
      to: 'node-text',
      fromSide: 'right',
      toSide: 'left',
      label: 'explains',
      arrow: 'to',
    },
  ],
  viewport: { x: 0, y: 0, zoom: 1 },
}

const NODE_LAYOUT: Record<string, { x: number; y: number; width: number; height: number }> = {
  'node-img': { x: 40, y: 60, width: 280, height: 220 },
  'node-text': { x: 420, y: 80, width: 240, height: 140 },
}

let currentTransform: [number, number, number] = [0, 0, 1]
let activeObservers: Set<{ cb: ResizeObserverCallback; targets: Set<Element>; instance: ResizeObserver }> = new Set()

function makeDOMRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect
}

function notifyAllResizeObservers() {
  for (const record of activeObservers) {
    const entries: ResizeObserverEntry[] = []
    for (const target of record.targets) {
      if (!target.isConnected) continue
      const el = target as HTMLElement
      const w = el.offsetWidth
      const h = el.offsetHeight
      entries.push({
        target,
        contentRect: makeDOMRect(0, 0, w, h),
        borderBoxSize: [{ inlineSize: w, blockSize: h }],
        contentBoxSize: [{ inlineSize: w, blockSize: h }],
        devicePixelContentBoxSize: [{ inlineSize: w, blockSize: h }],
      } as ResizeObserverEntry)
    }
    if (entries.length > 0) {
      record.cb(entries, record.instance)
    }
  }
}

class LayoutResizeObserver implements ResizeObserver {
  private targets = new Set<Element>()
  private record: { cb: ResizeObserverCallback; targets: Set<Element>; instance: ResizeObserver }

  constructor(cb: ResizeObserverCallback) {
    this.record = { cb, targets: this.targets, instance: this }
    activeObservers.add(this.record)
  }

  observe(target: Element) {
    this.targets.add(target)
    const el = target as HTMLElement
    const w = el.offsetWidth
    const h = el.offsetHeight
    this.record.cb(
      [
        {
          target,
          contentRect: makeDOMRect(0, 0, w, h),
          borderBoxSize: [{ inlineSize: w, blockSize: h }],
          contentBoxSize: [{ inlineSize: w, blockSize: h }],
          devicePixelContentBoxSize: [{ inlineSize: w, blockSize: h }],
        } as ResizeObserverEntry,
      ],
      this,
    )
  }

  unobserve(target: Element) {
    this.targets.delete(target)
  }

  disconnect() {
    this.targets.clear()
    activeObservers.delete(this.record)
  }
}

function ViewportController({
  onReady,
}: {
  onReady: (setTransform: (tx: number, ty: number, zoom: number) => void) => void
}) {
  const store = useStoreApi()
  const initializedRef = { current: false }
  if (!initializedRef.current) {
    initializedRef.current = true
    store.setState({ width: 800, height: 600, transform: [0, 0, 1] })
    onReady((tx: number, ty: number, zoom: number) => {
      currentTransform = [tx, ty, zoom]
      store.setState({ width: 800, height: 600, transform: [tx, ty, zoom] })
    })
  }
  return null
}

class MockDOMMatrixReadOnly {
  m22 = currentTransform[2]
  a = currentTransform[2]
  d = currentTransform[2]
  constructor(_init?: string | number[]) {
    this.m22 = currentTransform[2]
    this.a = currentTransform[2]
    this.d = currentTransform[2]
  }
}

describe('LearningCanvas real-layout viewport culling smoke test', () => {
  const origOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  const origOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
  const origGetBCR = HTMLElement.prototype.getBoundingClientRect

  beforeEach(() => {
    currentTransform = [0, 0, 1]
    activeObservers = new Set()
    vi.stubGlobal('ResizeObserver', LayoutResizeObserver)
    vi.stubGlobal('DOMMatrixReadOnly', MockDOMMatrixReadOnly)
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })

    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get(this: HTMLElement) {
        if (
          this.classList.contains('react-flow') ||
          this.classList.contains('react-flow__renderer') ||
          this.classList.contains('learning-canvas-wrapper')
        ) {
          return 800
        }
        if (this.classList.contains('react-flow__node')) {
          const id = this.getAttribute('data-id') ?? ''
          return NODE_LAYOUT[id]?.width ?? 240
        }
        if (this.classList.contains('canvas-handle')) {
          return 44
        }
        return 100
      },
    })

    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        if (
          this.classList.contains('react-flow') ||
          this.classList.contains('react-flow__renderer') ||
          this.classList.contains('learning-canvas-wrapper')
        ) {
          return 600
        }
        if (this.classList.contains('react-flow__node')) {
          const id = this.getAttribute('data-id') ?? ''
          return NODE_LAYOUT[id]?.height ?? 140
        }
        if (this.classList.contains('canvas-handle')) {
          return 44
        }
        return 100
      },
    })

    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement): DOMRect {
      const [tx, ty, zoom] = currentTransform
      if (
        this.classList.contains('react-flow') ||
        this.classList.contains('react-flow__renderer') ||
        this.classList.contains('learning-canvas-wrapper')
      ) {
        return makeDOMRect(0, 0, 800, 600)
      }
      if (this.classList.contains('react-flow__node')) {
        const id = this.getAttribute('data-id') ?? ''
        const layout = NODE_LAYOUT[id] ?? { x: 0, y: 0, width: 240, height: 140 }
        return makeDOMRect(tx + layout.x * zoom, ty + layout.y * zoom, layout.width * zoom, layout.height * zoom)
      }
      if (this.classList.contains('canvas-handle')) {
        const nodeEl = this.closest('.react-flow__node') as HTMLElement | null
        const id = nodeEl?.getAttribute('data-id') ?? ''
        const layout = NODE_LAYOUT[id] ?? { x: 0, y: 0, width: 240, height: 140 }
        const nodeLeft = tx + layout.x * zoom
        const nodeTop = ty + layout.y * zoom
        const nodeW = layout.width * zoom
        const nodeH = layout.height * zoom
        const handleSize = 44 * zoom
        const handleId = this.getAttribute('data-handleid')
        if (handleId === 'top') {
          return makeDOMRect(nodeLeft + nodeW / 2 - handleSize / 2, nodeTop - handleSize / 2, handleSize, handleSize)
        }
        if (handleId === 'right') {
          return makeDOMRect(nodeLeft + nodeW - handleSize / 2, nodeTop + nodeH / 2 - handleSize / 2, handleSize, handleSize)
        }
        if (handleId === 'bottom') {
          return makeDOMRect(nodeLeft + nodeW / 2 - handleSize / 2, nodeTop + nodeH - handleSize / 2, handleSize, handleSize)
        }
        return makeDOMRect(nodeLeft - handleSize / 2, nodeTop + nodeH / 2 - handleSize / 2, handleSize, handleSize)
      }
      return makeDOMRect(0, 0, 100, 100)
    }
  })

  afterEach(() => {
    cleanup()
    if (origOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', origOffsetWidth)
    if (origOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', origOffsetHeight)
    HTMLElement.prototype.getBoundingClientRect = origGetBCR
    vi.unstubAllGlobals()
  })

  it('culls off-screen cards, remounts them when panned back at zoom < 0.5 and 1.0, keeps 4 handles and edges intact, and positions QuickAddMenu inside container', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let setTransform: (tx: number, ty: number, zoom: number) => void = () => {}

    const { container } = render(
      <div className="w-[800px] h-[600px]">
        <ReactFlowProvider>
          <ViewportController
            onReady={(fn) => {
              setTransform = fn
            }}
          />
          <LearningCanvasInternal
            title="Culling Smoke Board"
            initialContent={cullingBoard}
            cullElements={true}
          />
          <QuickAddMenu position={{ x: 260, y: 190 }} onSelect={() => {}} onClose={() => {}} />
        </ReactFlowProvider>
      </div>,
    )

    act(() => {
      setTransform(0, 0, 1)
      notifyAllResizeObservers()
    })

    // 1. At initial viewport [0, 0, 1], both cards, all 4 TextCard handles, and the edge path are mounted
    await waitFor(() => {
      expect(screen.getByTestId('image-card-node-img')).not.toBeNull()
      expect(screen.getByTestId('text-card-node-text')).not.toBeNull()
      expect(container.querySelector('.learning-edge__path')).not.toBeNull()
    })
    expect(screen.getByTestId('text-card-node-text').querySelectorAll('.canvas-handle').length).toBe(4)

    // 2. Pan far away so both cards leave the viewport and are culled from the DOM
    act(() => {
      setTransform(-5000, -5000, 1)
    })
    await waitFor(() => {
      expect(screen.queryByTestId('image-card-node-img')).toBeNull()
      expect(screen.queryByTestId('text-card-node-text')).toBeNull()
    })

    // 3. Zoom below 0.5 (low-detail mode) while panned away, then pan cards back into the viewport at zoom = 0.35
    act(() => {
      setTransform(-5000, -5000, 0.35)
    })
    act(() => {
      setTransform(0, 0, 0.35)
      notifyAllResizeObservers()
    })

    await waitFor(() => {
      const textCard = screen.getByTestId('text-card-node-text')
      expect(textCard.classList.contains('learning-card--lod')).toBe(true)
      expect(textCard.querySelectorAll('.canvas-handle').length).toBe(4)
      expect(container.querySelector('.learning-edge__path')).not.toBeNull()
    })

    // 4. Zoom back to 100% (1.0) and verify handles and edge remain rendered with zero 008 errors
    act(() => {
      setTransform(0, 0, 1)
      notifyAllResizeObservers()
    })

    await waitFor(() => {
      const textCard = screen.getByTestId('text-card-node-text')
      expect(textCard.classList.contains('learning-card--lod')).toBe(false)
      expect(textCard.querySelectorAll('.canvas-handle').length).toBe(4)
      expect(container.querySelector('.learning-edge__path')).not.toBeNull()
    })

    const error008Calls = warnSpy.mock.calls.filter((args) => String(args[0] ?? '').includes('008'))
    expect(error008Calls).toEqual([])

    // 5. Verify QuickAddMenu is rendered inside the canvas container at exact screen coordinates
    const menu = screen.getByTestId('quick-add-menu')
    expect(container.contains(menu)).toBe(true)
    expect(menu.style.left).toBe('260px')
    expect(menu.style.top).toBe('190px')

    warnSpy.mockRestore()
  })

  it('reaches off-screen culled cards via Outline view and keyboard shortcuts (Ctrl+A / Delete)', async () => {
    let setTransform: (tx: number, ty: number, zoom: number) => void = () => {}

    render(
      <div className="w-[800px] h-[600px]">
        <ReactFlowProvider>
          <ViewportController
            onReady={(fn) => {
              setTransform = fn
            }}
          />
          <LearningCanvasInternal
            title="Accessible Culling Board"
            initialContent={cullingBoard}
            cullElements={true}
          />
        </ReactFlowProvider>
      </div>,
    )

    // Pan far away so all cards leave the DOM
    act(() => {
      setTransform(-5000, -5000, 1)
    })
    await waitFor(() => {
      expect(screen.queryByTestId('image-card-node-img')).toBeNull()
      expect(screen.queryByTestId('text-card-node-text')).toBeNull()
    })

    // Open the Outline view while both cards are culled off-screen
    fireEvent.click(screen.getByRole('button', { name: /Outline/i }))

    const outlineImg = screen.getByTestId('outline-node-node-img')
    const outlineText = screen.getByTestId('outline-node-node-text')
    expect(outlineImg.textContent).toContain('Diagram image')
    expect(outlineText.textContent).toContain('Connected explanation card')

    // Jumping to an off-screen card selects it in state even before the viewport animation finishes
    fireEvent.click(screen.getByRole('button', { name: 'Jump to Connected explanation card' }))

    // Keyboard shortcuts on the board (Ctrl+A then Delete) reach all off-screen culled cards
    const board = screen.getByTestId('learning-canvas-board')
    fireEvent.keyDown(board, { key: 'a', ctrlKey: true })
    fireEvent.keyDown(board, { key: 'Delete' })

    await waitFor(() => {
      expect(screen.queryByTestId('outline-node-node-img')).toBeNull()
      expect(screen.queryByTestId('outline-node-node-text')).toBeNull()
      expect(screen.getByText('No cards found.')).not.toBeNull()
    })
  })
})
