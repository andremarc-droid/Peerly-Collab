import { useEffect, useState } from 'react'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { Dialog } from '../../../shared/ui/Dialog'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { useAuth } from '../../auth/useAuth'
import { useFlashcardDecks } from '../../flashcards/useFlashcardDecks'
import type { FlashcardDeckWithId } from '../../flashcards/types'
import { shareDeckWithGroup } from '../services'

interface Props {
  groupId: string
  open: boolean
  onClose: () => void
  onShared: () => void
}

export function ShareDeckDialog({ groupId, open, onClose, onShared }: Props) {
  const { user } = useAuth()
  const workspaceId = user?.uid ?? ''
  const { decks, error } = useFlashcardDecks({
    role: 'student',
    uid: user?.uid,
    classIds: workspaceId ? [workspaceId] : [],
  })

  const [selectedDeck, setSelectedDeck] = useState<FlashcardDeckWithId | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setSelectedDeck(null)
      setActionError(null)
    }
  }, [open])

  const handleShare = async () => {
    if (!user || !selectedDeck) return
    setBusy(true)
    setActionError(null)
    try {
      await shareDeckWithGroup(
        groupId,
        selectedDeck,
        { uid: user.uid, displayName: user.displayName || user.email },
      )
      onShared()
      onClose()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not share deck.')
    } finally {
      setBusy(false)
    }
  }

  const myDecks = decks.filter((d) => d.ownerId === user?.uid)

  return (
    <Dialog
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Share a deck with the group"
      description="Choose one of your decks to share. Group members will be able to study this deck together."
    >
      <div className="grid gap-4">
        {actionError && <Alert tone="error" label="Error">{actionError}</Alert>}
        {error && <Alert tone="error" label="Could not load decks">{error}</Alert>}

        {myDecks.length === 0 ? (
          <EmptyState
            title="No decks available"
            description="Create flashcards in the Decks tab first, then share them here."
          />
        ) : (
          <div className="max-h-60 overflow-y-auto grid gap-2" role="radiogroup" aria-label="Choose deck to share">
            {myDecks.map((deck) => {
              const isSelected = selectedDeck?.id === deck.id
              return (
                <button
                  key={deck.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSelectedDeck(deck)}
                  className={`flex flex-col text-left rounded-2xl border p-3.5 transition focus:outline-none focus:ring-2 focus:ring-navy-900 ${
                    isSelected
                      ? 'border-navy-900 bg-navy-900-08'
                      : 'border-navy-900-15 bg-white hover:border-navy-900-30'
                  }`}
                >
                  <span className="font-bold text-navy-900 text-sm">{deck.title}</span>
                  <span className="text-xs text-navy-900-72 mt-1">
                    {deck.cardCount} cards {deck.description ? `· ${deck.description}` : ''}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={busy || !selectedDeck}
            onClick={() => void handleShare()}
          >
            {busy ? 'Sharing…' : 'Share with group'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
