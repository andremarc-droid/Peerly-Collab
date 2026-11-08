import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { Logo } from './Logo'

afterEach(cleanup)

function renderLogo(light?: boolean) {
  return render(<MemoryRouter><Logo light={light} /></MemoryRouter>)
}

describe('Logo', () => {
  it('links home with an accessible name', () => {
    renderLogo()
    expect(screen.getByRole('link', { name: 'Peerly Collab home' })).toHaveAttribute('href', '/')
  })

  it('shows the official logo image as a decorative mark next to the wordmark', () => {
    const { container } = renderLogo()
    const image = container.querySelector('.logo__mark img')
    expect(image).not.toBeNull()
    expect(image?.getAttribute('src')).toContain('peerly-collab-official-logo')
    // The link already has a name, so the image must not add a second announcement.
    expect(image).toHaveAttribute('alt', '')
    expect(container.querySelector('.logo__mark')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('peerly-collab')).toBeInTheDocument()
  })

  it('uses the light (white text) variant on navy by default and the dark variant when asked', () => {
    const { container, rerender } = renderLogo()
    expect(container.querySelector('.logo')).toHaveClass('logo--light')
    rerender(<MemoryRouter><Logo light={false} /></MemoryRouter>)
    expect(container.querySelector('.logo')).not.toHaveClass('logo--light')
  })
})
