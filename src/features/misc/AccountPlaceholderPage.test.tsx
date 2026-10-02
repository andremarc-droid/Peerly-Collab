import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AccountPlaceholderPage } from './AccountPlaceholderPage'
import { RolePage } from '../auth/RolePage'

function renderAccountPath(mode: 'signup' | 'signin') {
  render(
    <MemoryRouter initialEntries={[`/${mode}`]}>
      <Routes>
        <Route path="/signup" element={<AccountPlaceholderPage mode="signup" />} />
        <Route path="/signin" element={<AccountPlaceholderPage mode="signin" />} />
        <Route path="/role" element={<RolePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  sessionStorage.clear()
})

describe('account placeholder routes', () => {
  it.each(['signup', 'signin'] as const)('returns /%s visitors without a role to the matching role mode', async (mode) => {
    renderAccountPath(mode)
    expect(await screen.findByRole('radiogroup', { name: 'Choose your role' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Are you an instructor or a student?' })).toBeInTheDocument()
    expect(screen.getByText(mode === 'signup' ? 'Let’s set up your account.' : 'Welcome back.')).toBeInTheDocument()
  })
})
