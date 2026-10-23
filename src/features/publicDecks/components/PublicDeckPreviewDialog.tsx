import { useState } from 'react'
import { BookmarkPlus, Flag } from 'lucide-react'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { Dialog } from '../../../shared/ui/Dialog'
import type { PublicDeck } from '../types'

interface Props {
  deck: PublicDeck
  open: boolean
  onClose: () => void
  onSaveToLibrary: (deck: PublicDeck) => void
  onReport: (deck: PublicDeck) => void
  saving?: boolean
}

export function PublicDeckPreviewDialog({
  deck,
  open,
  onClose,
  onSaveToLibrary,
  onReport,
  saving = false,
}: Props) {
  const [flippedIndex, setFlippedIndex] = useState<number | null>(null)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={deck.title}
      description={`Created by ${deck.authorDisplayName} · ${deck.cardCount} cards · ${deck.savesCount} saved`}
    >
      <div className="grid gap-4">
        {deck.description && (
          <p className="m-0 text-base text-navy-900">{deck.description}</p>
        )}

        {deck.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Deck tags">
            {deck.tags.map(tag => (
              <Badge key={tag}>#{tag}</Badge>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-y border-navy-900-15 py-3">
          <Button
            variant="primary"
            disabled={saving}
            onClick={() => onSaveToLibrary(deck)}
          >
            <BookmarkPlus size={16} aria-hidden="true" />
            {saving ? 'Adding to library…' : 'Add to my library'}
          </Button>

          <Button
            variant="secondary"
            onClick={() => onReport(deck)}
          >
            <Flag size={16} aria-hidden="true" />
            Report deck
          </Button>
        </div>

        <section aria-label="Card preview" className="grid max-h-[50dvh] gap-3 overflow-y-auto pr-1">
          {deck.cards.map((card, idx) => {
            const isFlipped = flippedIndex === idx
            return (
              <article
                key={card.id || idx}
                className="grid gap-2 rounded-2xl border border-navy-900-15 bg-navy-900-04 p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold tracking-wider text-navy-900-72 uppercase">
                    Card {idx + 1} of {deck.cardCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFlippedIndex(isFlipped ? null : idx)}
                    className="text-xs font-semibold text-navy-900 underline hover:text-navy-700 min-h-11 px-2 focus:ring-2 focus:ring-navy-900 focus:outline-none rounded"
                  >
                    {isFlipped ? 'Show front' : 'Reveal answer'}
                  </button>
                </div>
                <div className="text-base text-navy-900">
                  <p className="m-0 font-medium">{isFlipped ? card.back : card.front}</p>
                </div>
              </article>
            )
          })}
        </section>
      </div>
    </Dialog>
  )
}
