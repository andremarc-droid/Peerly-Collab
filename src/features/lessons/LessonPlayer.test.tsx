import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeLesson, makePlan } from './testFactories'
import { LessonPlayer } from './LessonPlayer'

vi.mock('../learningCanvas/components/SafeMarkdown', () => ({ SafeMarkdown: ({ content }: { content: string }) => <p>{content}</p> }))
vi.mock('../flashcards/components/FlashcardPractice', () => ({ FlashcardPractice: () => <p>Flashcard practice session</p> }))
vi.mock('../flashcards/components/QuizModeScreen', () => ({ QuizModeScreen: ({ onComplete }: { onComplete?: (score: number, total: number) => void }) => <button onClick={() => onComplete?.(2, 3)}>Complete mock quiz</button> }))
afterEach(cleanup)

describe('LessonPlayer', () => {
  it('moves read to practice to quiz, records completion, and resumes at the saved step', () => {
    const onStep = vi.fn()
    const onQuizComplete = vi.fn()
    const common = { uid: 'learner', plan: makePlan(), lesson: makeLesson(), completion: { step: 'read' as const, bestScore: 0, completedAt: null }, onStep, onQuizComplete, onNext: vi.fn(), hasNext: true }
    const view = render(<LessonPlayer {...common} step="read"/>)
    expect(screen.getByText('Cells are the basic units of life.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continue to practice' }))
    expect(onStep).toHaveBeenCalledWith('practice')
    view.rerender(<LessonPlayer {...common} step="practice" completion={{ step: 'practice', bestScore: 0, completedAt: null }}/>)
    expect(screen.getByText('Flashcard practice session')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continue to quiz' }))
    expect(onStep).toHaveBeenCalledWith('quiz')
    view.rerender(<LessonPlayer {...common} step="quiz" completion={{ step: 'quiz', bestScore: 0, completedAt: null }}/>)
    fireEvent.click(screen.getByRole('button', { name: 'Complete mock quiz' }))
    expect(onQuizComplete).toHaveBeenCalledWith(2, 3)
    view.rerender(<LessonPlayer {...common} step="done" completion={{ step: 'done', bestScore: 2, completedAt: 12 }}/>)
    expect(screen.getByText('Best quiz score: 2 of 3.')).toBeTruthy()
  })
})
