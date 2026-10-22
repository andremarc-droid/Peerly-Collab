import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AssignmentTypeBadge, QuizTypeBadge } from './QuizTypeBadge'
import { quizModeLabel } from './types'

afterEach(cleanup)

describe('QuizTypeBadge', () => {
  it.each([
    ['quiz', 'badge--kind-quiz', 'Quiz'],
    ['flashcards', 'badge--kind-flashcards', 'Flashcards'],
    ['assignment', 'badge--kind-assignment', 'Assignment'],
  ] as const)('gives %s its own color class, label, and an icon', (mode, className, expectedLabel) => {
    render(<QuizTypeBadge mode={mode} />)
    const label = mode === 'assignment' ? expectedLabel : quizModeLabel(mode)
    const badge = screen.getByText(label)
    expect(badge).toHaveClass('badge', 'badge--kind', className)
    expect(badge.querySelector('svg')).toBeInTheDocument()
  })

  it('renders AssignmentTypeBadge with assignment kind styling and icon', () => {
    render(<AssignmentTypeBadge />)
    const badge = screen.getByText('Assignment')
    expect(badge).toHaveClass('badge', 'badge--kind', 'badge--kind-assignment')
    expect(badge.querySelector('svg')).toBeInTheDocument()
  })

  it('never shares a color class between types', () => {
    const classes = (['quiz', 'flashcards', 'assignment'] as const).map((mode) => {
      const { unmount } = render(<QuizTypeBadge mode={mode} />)
      const label = mode === 'assignment' ? 'Assignment' : quizModeLabel(mode)
      const found = Array.from(screen.getByText(label).classList).find((name) => name.startsWith('badge--kind-'))
      unmount()
      return found
    })
    expect(new Set(classes).size).toBe(3)
  })
})
