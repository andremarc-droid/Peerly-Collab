import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { RolePage } from './RolePage'
import { readRoleIntent } from './roleIntent'

const mockAuth = vi.hoisted(() => ({ status: 'signedOut' as 'loading' | 'signedOut' | 'signedIn', completeRoleSelection: vi.fn(async () => null) }))
vi.mock('./useAuth', () => ({ useAuth: () => ({ ...mockAuth, user: null }) }))

function renderRolePage(mode: string) {
  return render(
    <MemoryRouter initialEntries={[`/role?mode=${mode}`]}>
      <Routes>
        <Route path="/role" element={<RolePage />} />
        <Route path="/signup" element={<h1>Signup form coming next</h1>} />
        <Route path="/signin" element={<h1>Signin form coming next</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  mockAuth.status = 'signedOut'
  mockAuth.completeRoleSelection.mockClear()
})

describe('role choice screen', () => {
  it('keeps Continue disabled until a role is chosen', () => {
    renderRolePage('signup')
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  })

  it('supports keyboard arrow selection and continues signup with saved role', async () => {
    const user = userEvent.setup()
    renderRolePage('signup')
    screen.getByRole('radio', { name: /Student/ }).focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('radio', { name: /Instructor/ })).toHaveFocus()
    expect(screen.getByRole('radio', { name: /Instructor/ })).toBeChecked()
    await user.keyboard('{Enter}')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Signup form coming next')).toBeInTheDocument()
    expect(readRoleIntent()).toEqual({ role: 'instructor', mode: 'signup' })
  })

  it('continues sign in mode to the sign in placeholder', async () => {
    const user = userEvent.setup()
    renderRolePage('signin')
    await user.click(screen.getByRole('radio', { name: /Student/ }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Signin form coming next')).toBeInTheDocument()
    expect(readRoleIntent()).toEqual({ role: 'student', mode: 'signin' })
  })

  it('saves a missing role for a signed-in user and continues to profile', async () => {
    mockAuth.status = 'signedIn'
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/role?mode=continue']}>
        <Routes>
          <Route path="/role" element={<RolePage />} />
          <Route path="/instructor" element={<h1>Instructor dashboard</h1>} />
        </Routes>
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('radio', { name: /Instructor/ }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'Instructor dashboard' })).toBeInTheDocument()
    expect(mockAuth.completeRoleSelection).toHaveBeenCalledWith('instructor')
    expect(readRoleIntent()).toEqual({ role: 'instructor', mode: 'continue' })
  })
})
