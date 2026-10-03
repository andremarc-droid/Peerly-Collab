import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { QuizEditorPage } from './QuizEditorPage'

vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'teacher', displayName: 'Teacher' } }) }))
vi.mock('../../profile/useUserProfile', () => ({ useUserProfile: () => ({ profile: { name: 'Teacher' } }) }))
vi.mock('../services', () => ({ createQuiz: vi.fn(), getQuiz: vi.fn(), updateQuiz: vi.fn() }))
vi.mock('../../../shared/ui/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }))

afterEach(cleanup)

describe('quiz editor and deletion confirmation', () => {
  it('requires a title and keeps group participation visibly disabled', async () => {
    render(<MemoryRouter><QuizEditorPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(await screen.findByText('Enter a quiz title.')).toBeTruthy()
    expect(screen.getByText('Coming soon')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /add questions/i })).toBeNull()
  })

  it('requires the quiz title before confirming a destructive delete', () => {
    const onConfirm = vi.fn()
    render(<ConfirmDialog open onClose={vi.fn()} onConfirm={onConfirm} title="Delete quiz?" description="Submissions will be erased." requiredName="Algebra practice" confirmLabel="Delete quiz" />)
    const confirm = screen.getByRole('button', { name: 'Delete quiz' })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Type Algebra practice to confirm'), { target: { value: 'Algebra' } })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Type Algebra practice to confirm'), { target: { value: 'Algebra practice' } })
    expect((confirm as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(confirm)
    expect(onConfirm).toHaveBeenCalledOnce()
  })
})
