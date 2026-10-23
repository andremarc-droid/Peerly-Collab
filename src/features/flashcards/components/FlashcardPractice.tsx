import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react'
import { Button } from '../../../shared/ui/Button'
import { useAuth } from '../../auth/useAuth'
import { deckProgressKey, type StudyCard } from '../../studyEngine/queue'
import { loadProgress, saveProgress } from '../../studyEngine/services'
import { localDayKey, pruneProgress, recordGrade, type DeckProgress } from '../../studyEngine/progress'
import { recordActivity } from '../../stats/services'
import { reviewXp } from '../../stats/xp'
import { callRecordStudyEvent } from '../../scoreboard/services'
import { FlipCard } from './FlipCard'
import type { FlashcardDeckWithId } from '../types'

interface Props { deck: FlashcardDeckWithId; progressKey?: string }

export function FlashcardPractice({ deck, progressKey }: Props) {
  const { user } = useAuth()
  const [progress, setProgress] = useState<DeckProgress>({ version: 1, cards: {}, newDay: localDayKey(new Date()), newCount: 0 })
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const key = progressKey ?? deckProgressKey(deck.classId, deck.id)
  const cards: StudyCard[] = useMemo(() => deck.cards.map(({ id, front, back }) => ({ id, front, back })), [deck.cards])

  useEffect(() => {
    const uid = user?.uid
    if (!uid) { setLoading(false); return }
    let active = true
    void loadProgress(uid, key)
      .then(async value => {
        if (!active) return
        const pruned = pruneProgress(value, cards.map(card => card.id))
        if (Object.keys(pruned.cards).length !== Object.keys(value.cards).length) await saveProgress(uid, key, pruned)
        if (active) setProgress(pruned)
      })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load study progress.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [cards, key, user?.uid])

  const recordCardProgress = useCallback(async (cardId: string) => {
    if (!user) return
    try {
      const reviewedAt = Date.now()
      const next = recordGrade(progress, cardId, 'good', reviewedAt, localDayKey(new Date(reviewedAt)))
      setProgress(next)
      await saveProgress(user.uid, key, next)
      void recordActivity(user.uid, { kind: 'review', amount: reviewXp('good'), key: `review:${key}:${cardId}:${reviewedAt}:${Math.random()}` })
      void callRecordStudyEvent('card_mastered').catch(() => {})
    } catch {
      // Non-blocking error for review XP
    }
  }, [key, progress, user])

  const handleNext = useCallback(() => {
    const currentCard = cards[currentIndex]
    if (currentCard) void recordCardProgress(currentCard.id)
    if (currentIndex >= cards.length - 1) {
      setCompleted(true)
      void callRecordStudyEvent('practice_completed').catch(() => {})
    } else {
      setCurrentIndex(prev => prev + 1)
      setFlipped(false)
    }
  }, [cards, currentIndex, recordCardProgress])

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1)
      setFlipped(false)
    }
  }, [currentIndex])

  const handleRestart = useCallback(() => {
    setCurrentIndex(0)
    setFlipped(false)
    setCompleted(false)
  }, [])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.code === 'Space') { event.preventDefault(); setFlipped(value => !value) }
      else if (event.key === 'ArrowRight') { event.preventDefault(); handleNext() }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); handlePrev() }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleNext, handlePrev])

  // Horizontal touch / pointer swipe navigation
  const onSwipeStart = (clientX: number, clientY: number) => {
    touchStartX.current = clientX
    touchStartY.current = clientY
  }

  const onSwipeEnd = (clientX: number, clientY: number) => {
    if (touchStartX.current === null) return
    const deltaX = clientX - touchStartX.current
    const deltaY = clientY - (touchStartY.current ?? clientY)
    touchStartX.current = null
    touchStartY.current = null
    // Minimum 45px horizontal distance and predominantly horizontal movement
    if (Math.abs(deltaX) >= 45 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX < 0) {
        handleNext() // Swiped left -> next card
      } else {
        handlePrev() // Swiped right -> previous card
      }
    }
  }

  if (loading) return <p className="m-0 text-base text-navy-900" role="status">Loading your study progress…</p>
  if (error) return <p className="m-0 text-base text-navy-900" role="alert">{error}</p>
  if (cards.length === 0) return <p className="m-0 text-base text-navy-900">This deck has no cards.</p>

  if (completed) {
    return (
      <section className="grid gap-4 py-4 text-center" aria-live="polite">
        <h3 className="m-0 text-xl font-bold text-navy-900">Session complete</h3>
        <p className="m-0 text-base text-navy-900">You reviewed all {cards.length} cards in this deck.</p>
        <div className="flex justify-center gap-3">
          <Button variant="primary" onClick={handleRestart}>
            <RotateCcw size={16} aria-hidden="true" />
            <span>Study again</span>
          </Button>
        </div>
      </section>
    )
  }

  const current = cards[currentIndex]!
  const progressPercent = Math.round(((currentIndex + 1) / cards.length) * 100)

  return (
    <section className="grid gap-4" aria-label="Flashcard study">
      <div className="grid gap-2">
        <div className="flex items-center justify-between text-sm text-navy-900">
          <p className="m-0 font-medium" aria-live="polite">
            Card {currentIndex + 1} of {cards.length}
          </p>
          <span className="text-xs text-navy-900-60 font-semibold">{progressPercent}%</span>
        </div>
        <progress
          className="h-2.5 w-full rounded-full accent-navy-900"
          max={cards.length}
          value={currentIndex + 1}
          aria-label="Study session progress"
        >
          {progressPercent}%
        </progress>
      </div>

      <div
        className="select-none"
        style={{ touchAction: 'pan-y' }}
        onTouchStart={e => {
          const t = e.touches[0]
          if (t) onSwipeStart(t.clientX, t.clientY)
        }}
        onTouchEnd={e => {
          const t = e.changedTouches[0]
          if (t) onSwipeEnd(t.clientX, t.clientY)
        }}
        onPointerDown={e => onSwipeStart(e.clientX, e.clientY)}
        onPointerUp={e => onSwipeEnd(e.clientX, e.clientY)}
        onPointerCancel={() => { touchStartX.current = null }}
      >
        <FlipCard
          key={current.id}
          front={current.front}
          back={current.back}
          flipped={flipped}
          onFlip={() => setFlipped(value => !value)}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="flex-1"
            aria-label="Previous card"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Previous</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={() => setFlipped(v => !v)}
            className="flex-shrink-0 text-sm"
          >
            {flipped ? 'Show question' : 'Reveal answer'} <span className="sr-only">(Space)</span>
          </Button>

          <Button
            type="button"
            variant="primary"
            onClick={handleNext}
            className="flex-1"
            aria-label={currentIndex === cards.length - 1 ? 'Finish session' : 'Next card'}
          >
            <span>{currentIndex === cards.length - 1 ? 'Finish' : 'Next'}</span>
            <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </div>

        <p className="m-0 text-center text-xs text-navy-900-60">
          Swipe left for Next or right for Previous · Space to flip
        </p>
      </div>
    </section>
  )
}
