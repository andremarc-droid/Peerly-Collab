import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuizTitleField } from './QuizTitleField'

const mocks = vi.hoisted(() => ({
  updateQuiz: vi.fn(),
  showToast: vi.fn(),
}))

vi.mock('../services/quizService', () => ({ updateQuiz: mocks.updateQuiz }))
vi.mock('../../../shared/ui/useToast', () => ({ useToast: () => ({ showToast: mocks.showToast }) }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updateQuiz.mockResolvedValue(undefined)
})

afterEach(cleanup)

describe('QuizTitleField', () => {
  it('saves a changed title when the field loses focus', async () => {
    const onSaved = vi.fn()
    render(<QuizTitleField quizId="quiz-1" title="Biology" onSaved={onSaved} />)

    const field = screen.getByLabelText('Quiz title')
    fireEvent.change(field, { target: { value: '  Cell Biology  ' } })
    fireEvent.blur(field)

    await waitFor(() => expect(mocks.updateQuiz).toHaveBeenCalledWith('quiz-1', { title: 'Cell Biology' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Cell Biology'))
    expect(await screen.findByText('Title saved')).toBeInTheDocument()
  })

  it('does not save when the title did not change', () => {
    render(<QuizTitleField quizId="quiz-1" title="Biology" />)

    fireEvent.blur(screen.getByLabelText('Quiz title'))

    expect(mocks.updateQuiz).not.toHaveBeenCalled()
  })

  it('refuses an empty title and restores the previous one', () => {
    render(<QuizTitleField quizId="quiz-1" title="Biology" />)

    const field = screen.getByLabelText('Quiz title')
    fireEvent.change(field, { target: { value: '   ' } })
    fireEvent.blur(field)

    expect(mocks.updateQuiz).not.toHaveBeenCalled()
    expect(field).toHaveValue('Biology')
    expect(screen.getByText('A title is required.')).toBeInTheDocument()
  })

  it('restores the old title and shows an error when saving fails', async () => {
    mocks.updateQuiz.mockRejectedValueOnce(new Error('Network down'))
    render(<QuizTitleField quizId="quiz-1" title="Biology" />)

    const field = screen.getByLabelText('Quiz title')
    fireEvent.change(field, { target: { value: 'Chemistry' } })
    fireEvent.blur(field)

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith('error', 'Network down'))
    expect(field).toHaveValue('Biology')
  })
})
