import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Dialog } from './Dialog'

afterEach(cleanup)

describe('Dialog', () => {
  it('renders into document.body, outside a transformed page container', () => {
    const { container } = render(
      <div data-testid="page" className="m3-enter">
        <Dialog open onClose={() => undefined} title="Create deck"><p>fields</p></Dialog>
      </div>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Create deck' })
    expect(container.contains(dialog)).toBe(false)
    expect(dialog.closest('.dialog-backdrop')?.parentElement).toBe(document.body)
  })

  it('locks page scroll while open and restores it on close', () => {
    const { rerender } = render(<Dialog open onClose={() => undefined} title="Create deck"><p>fields</p></Dialog>)
    expect(document.body.style.overflow).toBe('hidden')
    rerender(<Dialog open={false} onClose={() => undefined} title="Create deck"><p>fields</p></Dialog>)
    expect(document.body.style.overflow).toBe('')
  })

  it('closes with Escape', () => {
    const onClose = vi.fn()
    render(<Dialog open onClose={onClose} title="Create deck"><p>fields</p></Dialog>)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps the dialog inside the visible area when a visual viewport is available', () => {
    const listeners = new Map<string, () => void>()
    const viewport = { height: 320, offsetTop: 0, addEventListener: (name: string, fn: () => void) => listeners.set(name, fn), removeEventListener: (name: string) => listeners.delete(name) }
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })
    render(<Dialog open onClose={() => undefined} title="Create deck"><p>fields</p></Dialog>)
    const backdrop = screen.getByRole('dialog').closest<HTMLElement>('.dialog-backdrop')!
    expect(backdrop.style.getPropertyValue('--vv-height')).toBe('320px')
    viewport.height = 600
    listeners.get('resize')?.()
    expect(backdrop.style.getPropertyValue('--vv-height')).toBe('600px')
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
  })
})
