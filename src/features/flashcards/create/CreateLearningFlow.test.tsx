import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateLearningFlow } from './CreateLearningFlow'

const mocks = vi.hoisted(() => ({ aiComplete: vi.fn(), createDeck: vi.fn() }))
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'learner' } }) }))
vi.mock('../../studyEngine/ai', async importOriginal => ({ ...await importOriginal<typeof import('../../studyEngine/ai')>(), aiComplete: mocks.aiComplete }))
vi.mock('../services', () => ({ createDeck: mocks.createDeck }))

function beginNotes(text = 'Cell biology is the study of cells and their functions.') {
  render(<CreateLearningFlow onClose={vi.fn()} onStudy={vi.fn()}/> )
  fireEvent.change(screen.getByLabelText(/Study notes/), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.click(screen.getByRole('button', { name: 'Choose output' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.aiComplete.mockResolvedValue('[{"front":"What is a cell?","back":"The basic unit of life."}]')
  mocks.createDeck.mockResolvedValue('new-deck')
})
afterEach(cleanup)

describe('CreateLearningFlow', () => {
  it('generates, reviews and saves a personal deck, then offers a quiz', async () => {
    const onStudy = vi.fn()
    render(<CreateLearningFlow onClose={vi.fn()} onStudy={onStudy}/> )
    fireEvent.change(screen.getByLabelText(/Study notes/), { target: { value: 'Cell biology is the study of cells.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose output' }))
    fireEvent.click(screen.getByRole('button', { name: 'Quiz from these cards' }))
    fireEvent.click(screen.getByRole('button', { name: 'Generate flashcards' }))
    fireEvent.change(await screen.findByLabelText('Deck title'), { target: { value: 'Cell biology' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save 1 deck' }))
    expect(await screen.findByRole('heading', { name: 'Personal deck saved' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Start quiz' }))
    expect(onStudy).toHaveBeenCalledWith(expect.objectContaining({ classId: 'learner', ownerId: 'learner', status: 'private' }), 'quiz')
  })

  it('keeps partial output after a later chunk failure and offers retry', async () => {
    mocks.aiComplete.mockImplementationOnce(async () => '[{"front":"First chunk","back":"Kept"}]').mockRejectedValueOnce(new Error('offline'))
    beginNotes(`${'alpha '.repeat(1100)}\n\n${'beta '.repeat(1100)}`)
    fireEvent.click(screen.getByRole('button', { name: 'Generate flashcards' }))
    expect(await screen.findByRole('button', { name: 'Retry remaining chunks' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue with 1 cards' })).toBeTruthy()
    expect(screen.getByText(/completed cards are kept/)).toBeTruthy()
  })

  it('stops generation while keeping the resolved card', async () => {
    let resolveReply: ((value: string) => void) | undefined
    mocks.aiComplete.mockImplementation(() => new Promise<string>(resolve => { resolveReply = resolve }))
    beginNotes(`${'alpha '.repeat(1100)}\n\n${'beta '.repeat(1100)}`)
    fireEvent.click(screen.getByRole('button', { name: 'Generate flashcards' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Stop generation' }))
    resolveReply?.('[{"front":"Saved partial","back":"Answer"}]')
    expect(await screen.findByRole('button', { name: 'Continue with 1 cards' })).toBeTruthy()
    expect(screen.getByText(/Generation stopped/)).toBeTruthy()
  })

  it('renders a clear rate-limit state and keeps the user on the generation step', async () => {
    const { AiError } = await import('../../studyEngine/ai')
    mocks.aiComplete.mockRejectedValue(new AiError('rate-limit', 'Too many requests'))
    beginNotes()
    fireEvent.click(screen.getByRole('button', { name: 'Generate flashcards' }))
    expect(await screen.findByText(/rate-limited right now/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry remaining chunks' })).toBeTruthy()
  })
})
