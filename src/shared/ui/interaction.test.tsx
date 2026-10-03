import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Dialog } from './Dialog'
import { ConfirmDialog } from './ConfirmDialog'
import { DropdownMenu } from './DropdownMenu'
import { Tabs } from './Tabs'
import { ToastProvider } from './ToastProvider'
import { useToast } from './useToast'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  document.body.style.overflow = ''
})

describe('shared interaction components', () => {
  it('traps dialog focus, locks scroll, closes on Escape, and restores focus', () => {
    const onClose = vi.fn()
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const view = render(<Dialog open onClose={onClose} title="Example dialog"><button type="button">Last action</button></Dialog>)
    const dialog = screen.getByRole('dialog', { name: 'Example dialog' })
    const close = screen.getByRole('button', { name: 'Close dialog' })
    const lastAction = screen.getByRole('button', { name: 'Last action' })
    expect(document.body.style.overflow).toBe('hidden')
    expect(close).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(lastAction).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    view.rerender(<Dialog open={false} onClose={onClose} title="Example dialog"><button type="button">Last action</button></Dialog>)
    expect(document.body.style.overflow).toBe('')
    expect(opener).toHaveFocus()
    opener.remove()
  })

  it('supports arrow navigation and Escape focus return in dropdown menus', () => {
    render(<DropdownMenu label="Account menu" trigger="Account"><button type="button" role="menuitem">Profile</button><button type="button" role="menuitem">Sign out</button></DropdownMenu>)
    const trigger = screen.getByRole('button', { name: 'Account menu' })
    fireEvent.click(trigger)
    const profile = screen.getByRole('menuitem', { name: 'Profile' })
    const signOut = screen.getByRole('menuitem', { name: 'Sign out' })
    expect(profile).toHaveFocus()
    fireEvent.keyDown(profile, { key: 'ArrowDown' })
    expect(signOut).toHaveFocus()
    fireEvent.keyDown(signOut, { key: 'Escape' })
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('requires the exact name in a typed confirmation dialog', () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(<ConfirmDialog open onConfirm={onConfirm} onClose={onClose} title="Remove preview" description="Confirm this sample action." requiredName="Peerly Collab" />)
    const confirmButton = screen.getByRole('button', { name: 'Confirm' })
    expect(confirmButton).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'peerly-collab' } })
    expect(confirmButton).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Peerly Collab' } })
    expect(confirmButton).toBeEnabled()
    fireEvent.click(confirmButton)
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('moves between tabs with arrow keys and keeps the panel connected', () => {
    render(<Tabs label="Sample sections" tabs={[{ label: 'Overview', content: 'Overview details.' }, { label: 'Settings', content: 'Settings details.' }]} />)
    const overview = screen.getByRole('tab', { name: 'Overview' })
    fireEvent.keyDown(overview, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Settings details.')
  })

  it('announces toasts and allows dismissing and automatic dismissal', async () => {
    function ToastTrigger() {
      const { showToast } = useToast()
      return <button type="button" onClick={() => showToast('info', 'A saved view is ready.')}>Show toast</button>
    }
    vi.useFakeTimers()
    render(<ToastProvider><ToastTrigger /></ToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Show toast' }))
    const toast = screen.getByText('A saved view is ready.').closest('[role="status"]')
    expect(toast).toHaveTextContent('InformationA saved view is ready.')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss information notification' }))
    expect(screen.queryByText('A saved view is ready.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show toast' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(screen.queryByText('A saved view is ready.')).not.toBeInTheDocument()
  })
})
