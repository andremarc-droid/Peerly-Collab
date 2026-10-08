import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RouteErrorBoundary } from './RouteErrorBoundary'

function Broken(): never {
  throw new Error('chunk failed')
}

afterEach(cleanup)

describe('RouteErrorBoundary', () => {
  it('renders its children when nothing fails', () => {
    render(<RouteErrorBoundary><p>All good</p></RouteErrorBoundary>)
    expect(screen.getByText('All good')).toBeInTheDocument()
  })

  it('shows a recoverable message instead of a blank screen when a page fails', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<RouteErrorBoundary><Broken /></RouteErrorBoundary>)
    expect(screen.getByText('This page couldn’t load')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument()
  })
})
