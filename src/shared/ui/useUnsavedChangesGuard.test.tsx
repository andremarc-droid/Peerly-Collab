import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BrowserRouter, Link } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard'

function TestComponent({ dirty }: { dirty: boolean }) {
  useUnsavedChangesGuard(dirty)
  return (
    <div>
      <Link to="/target">In-app link</Link>
      <a href="https://example.com" target="_blank" rel="noreferrer">
        External blank link
      </a>
      <button type="button">Button action</button>
    </div>
  )
}

describe('useUnsavedChangesGuard', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows navigation without prompt when dirty is false', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(
      <BrowserRouter>
        <TestComponent dirty={false} />
      </BrowserRouter>,
    )

    const inAppLink = screen.getByText('In-app link')
    fireEvent.click(inAppLink)

    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('prompts window.confirm and cancels navigation when user declines if dirty is true', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(
      <BrowserRouter>
        <TestComponent dirty={true} />
      </BrowserRouter>,
    )

    const inAppLink = screen.getByText('In-app link')
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    inAppLink.dispatchEvent(event)

    expect(confirmSpy).toHaveBeenCalledWith('You have unsaved changes. Leave without saving?')
    expect(event.defaultPrevented).toBe(true)
  })

  it('prompts window.confirm and allows navigation when user confirms', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(
      <BrowserRouter>
        <TestComponent dirty={true} />
        <a href="/target-regular">Regular anchor</a>
      </BrowserRouter>,
    )

    const anchor = screen.getByText('Regular anchor')
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    anchor.dispatchEvent(event)

    expect(confirmSpy).toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('does not prompt when clicking buttons or target="_blank" links', () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    render(
      <BrowserRouter>
        <TestComponent dirty={true} />
      </BrowserRouter>,
    )

    fireEvent.click(screen.getByText('Button action'))
    expect(confirmSpy).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('External blank link'))
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('guards on beforeunload when dirty is true', () => {
    render(
      <BrowserRouter>
        <TestComponent dirty={true} />
      </BrowserRouter>,
    )

    const beforeUnloadEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(beforeUnloadEvent)

    expect(beforeUnloadEvent.defaultPrevented).toBe(true)
  })

  it('guards on popstate event when dirty is true', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const pushStateSpy = vi.spyOn(window.history, 'pushState')

    render(
      <BrowserRouter>
        <TestComponent dirty={true} />
      </BrowserRouter>,
    )

    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(confirmSpy).toHaveBeenCalledWith('You have unsaved changes. Leave without saving?')
    expect(pushStateSpy).toHaveBeenCalled()
  })
})
