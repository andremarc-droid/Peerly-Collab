import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectionNotice } from './ConnectionNotice'

afterEach(cleanup)

describe('ConnectionNotice', () => {
  it('shows the rejection message and can be dismissed', () => {
    const onDismiss = vi.fn()
    render(<ConnectionNotice message="Those cards are already connected." onDismiss={onDismiss} />)
    expect(screen.getByRole('status')).toHaveTextContent('Those cards are already connected.')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
