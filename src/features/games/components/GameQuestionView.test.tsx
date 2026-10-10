import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GameQuestionView } from './GameQuestionView'
import type { CurrentQuestion, Game, GamePlayer, RevealState } from '../types'

const game: Game = { id: 'g1', hostId: 'host', groupId: null, code: 'ABC234', status: 'question', questionIndex: 0, questionCount: 5, questionStartedAtMs: 0, questionEndsAtMs: 20000, timeLimitSec: 20, playerCount: 2, expiresAtMs: Date.now() + 3_600_000 }
const current: CurrentQuestion = { questionIndex: 0, prompt: 'What is 2 + 2?', options: ['3', '4', '5', '6'], startedAtMs: 0, endsAtMs: 20000 }
const players: GamePlayer[] = [
  { uid: 'p1', displayName: 'Ada', score: 1200, answeredIndex: 0 },
  { uid: 'p2', displayName: 'Bo', score: 0, answeredIndex: null },
]
const reveal: RevealState = { questionIndex: 0, correctOptionIndex: 1, perPlayerPoints: { p1: 1200 } }

const base = { game, current, reveal: null, players, meUid: 'p2', busy: false, secondsLeft: 12, chosen: null, onAnswer: vi.fn(), onNext: vi.fn() }

describe('GameQuestionView', () => {
  it('lets a player pick an answer while the question is open', () => {
    const onAnswer = vi.fn()
    render(<GameQuestionView {...base} isHost={false} onAnswer={onAnswer}/>)
    fireEvent.click(screen.getByRole('button', { name: /4/ }))
    expect(onAnswer).toHaveBeenCalledWith(1)
  })

  it('locks every answer once this player has answered', () => {
    render(<GameQuestionView {...base} isHost={false} meUid="p1"/>)
    screen.getAllByRole('button').forEach(button => expect((button as HTMLButtonElement).disabled).toBe(true))
  })

  it('never lets the host answer and shows how many have answered', () => {
    render(<GameQuestionView {...base} isHost meUid="host"/>)
    screen.getAllByRole('button').forEach(button => expect((button as HTMLButtonElement).disabled).toBe(true))
    expect(screen.getByText('1 of 2 answered')).toBeTruthy()
  })

  it('shows the correct answer, points and a Next button for the host on reveal', () => {
    const onNext = vi.fn()
    render(<GameQuestionView {...base} isHost meUid="host" game={{ ...game, status: 'reveal' }} reveal={reveal} onNext={onNext}/>)
    expect(screen.getByText('Correct answer')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))
    expect(onNext).toHaveBeenCalled()
  })

  it('tells a player who scored that they were correct', () => {
    render(<GameQuestionView {...base} isHost={false} meUid="p1" chosen={1} game={{ ...game, status: 'reveal' }} reveal={reveal}/>)
    expect(screen.getByText('Correct! +1200 points')).toBeTruthy()
  })

  it('offers the final results on the last question', () => {
    render(<GameQuestionView {...base} isHost meUid="host" game={{ ...game, status: 'reveal', questionIndex: 4 }} current={{ ...current, questionIndex: 0 }} reveal={reveal}/>)
    expect(screen.getByRole('button', { name: 'Show final results' })).toBeTruthy()
  })
})
