import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ExpandableCanvasContainer } from './ExpandableCanvasContainer'

afterEach(() => {
  cleanup()
})

describe('ExpandableCanvasContainer', () => {
  it('renders children and default expand button', () => {
    render(
      <ExpandableCanvasContainer title="My Board">
        <div data-testid="child-content">Child content</div>
      </ExpandableCanvasContainer>,
    )

    expect(screen.getByTestId('child-content')).toBeInTheDocument()
    expect(screen.getByText('My Board')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Expand board/i })).toBeInTheDocument()
  })

  it('toggles expand state when expand button is clicked', () => {
    render(
      <ExpandableCanvasContainer title="My Board">
        <div>Child content</div>
      </ExpandableCanvasContainer>,
    )

    const expandBtn = screen.getByRole('button', { name: /Expand board/i })
    fireEvent.click(expandBtn)

    // In expanded mode
    expect(screen.getByRole('button', { name: /Exit full screen/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Close full screen/i })).toBeInTheDocument()
  })

  it('exits expanded mode when Escape key is pressed', () => {
    render(
      <ExpandableCanvasContainer title="My Board">
        <div>Child content</div>
      </ExpandableCanvasContainer>,
    )

    const expandBtn = screen.getByRole('button', { name: /Expand board/i })
    fireEvent.click(expandBtn)
    expect(screen.getByRole('button', { name: /Exit full screen/i })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })

    // Exited expanded mode, expand button is back
    expect(screen.getByRole('button', { name: /Expand board/i })).toBeInTheDocument()
  })
})
