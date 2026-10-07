import { useState } from 'react'
import { Check, Eye, RotateCcw, Shuffle } from 'lucide-react'
import { Button } from '../../../shared/ui/Button'
import { Dialog } from '../../../shared/ui/Dialog'
import {
  currentCard,
  flipCard,
  isComplete,
  markCard,
  startReviewSession,
  startSession,
} from '../studySession'
import type { FlashcardDeckWithId } from '../types'
import { FlipCard } from './FlipCard'

interface FlashcardStudyDialogProps {
  deck: FlashcardDeckWithId
  onClose: () => void
}

export function FlashcardStudyDialog({ deck, onClose }: FlashcardStudyDialogProps) {
  const [session, setSession] = useState(() => startSession(deck.cards))

  const total = session.order.length
  const card = currentCard(session)
  const complete = isComplete(session)
  const knownCount = session.known.length
  const reviewCount = session.review.length

  return (
    <Dialog
      open
      onClose={onClose}
      title={deck.title}
      description={complete ? 'Session complete' : `Card ${session.index + 1} of ${total}`}
    >
      {complete || !card ? (
        <div className="grid gap-4" aria-live="polite">
          <p className="m-0 text-base text-navy-900">
            You got {knownCount} of {total} {total === 1 ? 'card' : 'cards'}.{' '}
            {reviewCount > 0
              ? `${reviewCount} ${reviewCount === 1 ? 'card is' : 'cards are'} still learning.`
              : 'Nice work, nothing left to review.'}
          </p>
          <div className="dialog__actions">
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSession(startSession(deck.cards))}
            >
              <RotateCcw size={16} aria-hidden="true" />
              <span>Study all again</span>
            </Button>
            {reviewCount > 0 && (
              <Button
                type="button"
                variant="primary"
                onClick={() => setSession(startReviewSession(session))}
              >
                <span>Review {reviewCount} missed</span>
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <p className="m-0 text-sm text-navy-800" aria-live="polite">
            {knownCount} got it · {reviewCount} still learning
          </p>

          <FlipCard
            key={card.id}
            front={card.front}
            back={card.back}
            flipped={session.flipped}
            onFlip={() => setSession((s) => flipCard(s))}
          />

          <div className="dialog__actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSession(startSession(deck.cards, { shuffle: true }))}
            >
              <Shuffle size={16} aria-hidden="true" />
              <span>Shuffle</span>
            </Button>
            {session.flipped ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setSession((s) => markCard(s, 'review'))}
                >
                  <RotateCcw size={16} aria-hidden="true" />
                  <span>Still learning</span>
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => setSession((s) => markCard(s, 'known'))}
                >
                  <Check size={16} aria-hidden="true" />
                  <span>Got it</span>
                </Button>
              </>
            ) : (
              <Button type="button" variant="primary" onClick={() => setSession((s) => flipCard(s))}>
                <Eye size={16} aria-hidden="true" />
                <span>Reveal answer</span>
              </Button>
            )}
          </div>
        </div>
      )}
    </Dialog>
  )
}
