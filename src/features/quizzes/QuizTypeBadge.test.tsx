import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { QuizTypeBadge } from './QuizTypeBadge'
import { quizModeLabel } from './types'

afterEach(cleanup)

describe('QuizTypeBadge', () => {
  it.each([
    ['quiz', 'badge--kind-quiz'],
    ['flashcards', 'badge--kind-flashcards'],
    ['canvas', 'badge--kind-canvas'],
  ] as const)('gives %s its own color class and an icon', (mode, className) => {
    render(<QuizTypeBadge mode={mode} />)
    const badge = screen.getByText(quizModeLabel(mode))
    expect(badge).toHaveClass('badge', 'badge--kind', className)
    expect(badge.querySelector('svg')).toBeInTheDocument()
  })

  it('never shares a color class between types', () => {
    const classes = (['quiz', 'flashcards', 'canvas'] as const).map((mode) => {
      const { unmount } = render(<QuizTypeBadge mode={mode} />)
      const found = [...screen.getByText(quizModeLabel(mode)).classList].find((name) => name.startsWith('badge--kind-'))
      unmount()
      return found
    })
    expect(new Set(classes).size).toBe(3)
  })
})
