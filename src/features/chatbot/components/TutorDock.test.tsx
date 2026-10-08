import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TutorDock } from './TutorDock'

afterEach(cleanup)

function setup(defaultOpen = false) {
  return render(
    <TutorDock defaultOpen={defaultOpen}>
      <p>tutor content</p>
    </TutorDock>,
  )
}

describe('TutorDock', () => {
  it('shows only the floating button while closed, keeping the tutor mounted', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Open AI tutor' })).toBeVisible()
    expect(screen.getByText('tutor content')).not.toBeVisible()
  })

  it('opens the tutor in a panel and hides the button', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Open AI tutor' }))
    expect(screen.getByRole('dialog', { name: 'AI tutor' })).toBeVisible()
    expect(screen.getByText('tutor content')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Open AI tutor' })).not.toBeInTheDocument()
  })

  it('closes with the close button and with Escape', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Open AI tutor' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close AI tutor' }))
    expect(screen.getByRole('button', { name: 'Open AI tutor' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Open AI tutor' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Open AI tutor' })).toBeVisible()
  })

  it('starts open when arriving from a shared-conversation link', () => {
    setup(true)
    expect(screen.getByRole('dialog', { name: 'AI tutor' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Open AI tutor' })).not.toBeInTheDocument()
  })
})
