import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LearningInviteCodeInput } from './LearningInviteCodeInput'

const view = vi.hoisted(() => ({ mobile: false }))
vi.mock('../../lib/platform/isMobileView', () => ({ useIsMobileView: () => view.mobile }))

afterEach(cleanup)
beforeEach(() => {
  view.mobile = false
})

describe('LearningInviteCodeInput', () => {
  it('uses a compact row on desktop', () => {
    render(
      <MemoryRouter>
        <LearningInviteCodeInput />
      </MemoryRouter>,
    )
    const input = screen.getByLabelText('Enter a learning invite code')
    expect(input).toHaveClass('invite-code__input', 'w-36')
    expect(screen.getByRole('button', { name: /Join/ })).toBeInTheDocument()
  })

  it('uses a full-width 56px field on phones instead of a squeezed row', () => {
    view.mobile = true
    render(
      <MemoryRouter>
        <LearningInviteCodeInput />
      </MemoryRouter>,
    )
    const input = screen.getByLabelText('Invite code')
    expect(input).toHaveClass('h-14', 'w-full', 'm3-field', 'invite-code__input')
    expect(input).not.toHaveClass('w-36')
    expect(input.closest('form')).toHaveClass('invite-code__form--stack')
    const join = screen.getByRole('button', { name: 'Join with code' })
    expect(join).toHaveClass('w-full', 'min-h-14')
    expect(join).toBeDisabled()
  })
})
