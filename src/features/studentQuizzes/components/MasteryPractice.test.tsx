import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MasteryPractice, type MasteryItem } from './MasteryPractice'

afterEach(() => {
  cleanup()
})

const choiceItem: MasteryItem = {
  id: 'q1',
  question: {
    id: 'q1',
    prompt: 'What is the capital of France?',
    type: 'multiple_choice',
    points: 1,
    order: 0,
    options: [
      { id: 'opt1', text: 'London' },
      { id: 'opt2', text: 'Paris' },
      { id: 'opt3', text: 'Berlin' },
    ],
  },
  key: {
    type: 'choice',
    correctOptionId: 'opt2',
    explanation: 'Paris is the capital of France.',
    caseSensitive: false,
  },
}

const identItem: MasteryItem = {
  id: 'q2',
  question: {
    id: 'q2',
    prompt: 'Name the process plants use to make food.',
    type: 'identification',
    points: 1,
    order: 1,
  },
  key: {
    type: 'identification',
    acceptedAnswers: ['Photosynthesis'],
    caseSensitive: false,
    explanation: '',
  },
}

describe('MasteryPractice', () => {
  it('renders an empty state if no items are provided', () => {
    const onExit = vi.fn()
    render(<MasteryPractice items={[]} onExit={onExit} />)
    expect(screen.getByText('No missed questions to practice.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back to result' }))
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('progresses through a question with incorrect answer and allows retry in round 2', () => {
    const onExit = vi.fn()
    render(<MasteryPractice items={[choiceItem]} onExit={onExit} />)

    // Initial state: question 1 of 1
    expect(screen.getByText('What is the capital of France?')).toBeTruthy()
    expect(screen.getByText(/Question 1 of 1/)).toBeTruthy()

    // Pick incorrect option 'London'
    fireEvent.click(screen.getByRole('button', { name: 'London' }))

    // Verdict appears
    expect(screen.getByText('Needs practice')).toBeTruthy()
    expect(screen.getByText(/Paris is the capital of France\./)).toBeTruthy()

    // Advance to round summary
    fireEvent.click(screen.getByRole('button', { name: /Complete round/ }))
    expect(screen.getByText('Round 1 complete')).toBeTruthy()
    expect(screen.getByText(/1 question still needs practice\./)).toBeTruthy()

    // Click retry missed
    fireEvent.click(screen.getByRole('button', { name: /Retry missed questions/ }))

    // Round 2
    expect(screen.getByText(/Round 2/)).toBeTruthy()
    expect(screen.getByText('What is the capital of France?')).toBeTruthy()

    // Pick correct option 'Paris'
    fireEvent.click(screen.getByRole('button', { name: 'Paris' }))
    expect(screen.getByText('Correct!')).toBeTruthy()

    // Advance
    fireEvent.click(screen.getByRole('button', { name: /Complete round/ }))

    // Mastery achieved!
    expect(screen.getByText('Mastery achieved!')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back to result review' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Back to result review' }))
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('checks identification answers and exits when requested', () => {
    const onExit = vi.fn()
    render(<MasteryPractice items={[identItem]} onExit={onExit} />)

    expect(screen.getByText('Name the process plants use to make food.')).toBeTruthy()

    const input = screen.getByPlaceholderText('Type your answer…')
    fireEvent.change(input, { target: { value: 'photosynthesis' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }))

    expect(screen.getByText('Correct!')).toBeTruthy()

    // Exit practice at any time
    fireEvent.click(screen.getByRole('button', { name: 'Exit mastery practice' }))
    expect(onExit).toHaveBeenCalledTimes(1)
  })
})
