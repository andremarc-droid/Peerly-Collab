import { useState } from 'react'
import type { FlashcardDeckWithId } from '../../flashcards/types'
import type { LessonPlan } from '../../lessons/types'
import type { GameSourceChoice } from '../types'
import { HostGameButton } from './HostGameButton'

interface Props {
  /** Omit to host a game that is not tied to a group. */
  groupId?: string
  decks: FlashcardDeckWithId[]
  plans: LessonPlan[]
}

/** Lets someone pick one of their own decks or lesson plans and host a live game, optionally for a group. */
export function HostGroupGame({ groupId, decks, plans }: Props) {
  const [choice, setChoice] = useState('')
  const options: Array<{ key: string; label: string; source: GameSourceChoice }> = [
    ...decks.map(deck => ({ key: `deck:${deck.classId}:${deck.id}`, label: `Deck · ${deck.title}`, source: { kind: 'deck', classId: deck.classId, deckId: deck.id } as const })),
    ...plans.map(plan => ({ key: `lesson:${plan.id}`, label: `Lesson plan · ${plan.title}`, source: { kind: 'lesson', planId: plan.id } as const })),
  ]
  const selected = options.find(option => option.key === choice)
  return (
    <section className="grid gap-3 rounded-3xl border border-navy-900-15 bg-white p-5" aria-label="Host a live game">
      <h3 className="m-0 text-lg font-bold text-navy-900">Host a live game</h3>
      <p className="m-0 text-base text-navy-900">Quiz players live from one of your decks or lesson plans. They join with a code.</p>
      {options.length ? (
        <>
          <label className="field">
            <span className="field__label">Study item</span>
            <select className="field__control" value={choice} onChange={event => setChoice(event.target.value)}>
              <option value="">Choose a deck or lesson plan</option>
              {options.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </label>
          {selected ? <HostGameButton source={selected.source} groupId={groupId}/> : null}
        </>
      ) : <p className="m-0 text-base text-navy-900">Create a deck or lesson plan first.</p>}
    </section>
  )
}
