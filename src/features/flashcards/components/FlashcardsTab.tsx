import { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, Edit3, Link2, Play, Plus, Search, Trash2, X } from 'lucide-react'
import { Alert } from '../../../shared/ui/Alert'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { useToast } from '../../../shared/ui/useToast'
import { useAuth } from '../../auth/useAuth'
import { createDeck, deleteDeck, updateDeck } from '../services'
import { summarizeDeckChanges } from '../activity'
import { logDeckActivity, writeDeckPresence } from '../sharing'
import type { FlashcardDeckWithId } from '../types'
import { DeckEditorDialog, type DeckEditorValues } from './DeckEditorDialog'
import { FlashcardStudyDialog } from './FlashcardStudyDialog'
import { DeckShareDialog } from './DeckShareDialog'

interface FlashcardsTabProps {
  decks: FlashcardDeckWithId[]
  classes: Array<{ id: string; name: string; isPersonalWorkspace?: boolean }>
  selectedClassId: string
  role: 'instructor' | 'student'
  error?: string | null
  onCreateDeck?: () => void
}

function statusLabel(deck: FlashcardDeckWithId, uid: string | undefined): string {
  if (deck.sharedRole) return deck.sharedRole === 'editor' ? 'Shared · Can edit' : 'Shared · View only'
  if (deck.kind === 'personal') return 'Private'
  if (deck.ownerId !== uid) return 'From instructor'
  return deck.status === 'published' ? 'Published' : 'Draft'
}

function formatDate(deck: FlashcardDeckWithId): string {
  return deck.updatedAt.toDate().toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function FlashcardsTab({ decks, classes, selectedClassId, role, error, onCreateDeck }: FlashcardsTabProps) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const uid = user?.uid

  const [search, setSearch] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<FlashcardDeckWithId | null>(null)
  const [studying, setStudying] = useState<FlashcardDeckWithId | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FlashcardDeckWithId | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [sharing, setSharing] = useState<FlashcardDeckWithId | null>(null)
  const presenceFailureShown = useRef(false)

  const classNames = useMemo(() => new Map(classes.map((c) => [c.id, c.name])), [classes])
  const defaultClassId = selectedClassId !== 'all' ? selectedClassId : (classes[0]?.id ?? '')
  const activeDeck = studying ?? editing ?? sharing

  useEffect(() => {
    if (!activeDeck || !uid || (activeDeck.ownerId !== uid && !activeDeck.sharedRole)) return undefined
    let active = true
    const pulse = () => {
      if (!active || document.visibilityState !== 'visible') return
      void writeDeckPresence(activeDeck.classId, activeDeck.id, uid, user?.displayName || user?.email || 'Learner', true)
        .then(() => { presenceFailureShown.current = false })
        .catch((cause: unknown) => {
          if (!active || presenceFailureShown.current) return
          presenceFailureShown.current = true
          showToast('error', cause instanceof Error ? `Presence could not be updated: ${cause.message}` : 'Presence could not be updated.')
        })
    }
    pulse()
    const timer = window.setInterval(pulse, 20_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [activeDeck, uid, user?.displayName, user?.email, showToast])

  const visibleDecks = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return decks.filter((deck) => {
      if (selectedClassId !== 'all' && deck.classId !== selectedClassId) return false
      if (!needle) return true
      return (
        deck.title.toLowerCase().includes(needle) ||
        deck.description.toLowerCase().includes(needle) ||
        deck.cards.some(
          (card) =>
            card.front.toLowerCase().includes(needle) || card.back.toLowerCase().includes(needle),
        )
      )
    })
  }, [decks, search, selectedClassId])

  const openCreate = () => {
    if (onCreateDeck) { onCreateDeck(); return }
    setEditing(null)
    setEditorOpen(true)
  }

  const openEdit = (deck: FlashcardDeckWithId) => {
    setEditing(deck)
    setEditorOpen(true)
  }

  const closeEditor = () => {
    setEditorOpen(false)
    setEditing(null)
  }

  const handleSave = async (values: DeckEditorValues) => {
    if (!uid) throw new Error('You need to be signed in to save a deck.')
    if (editing) {
      await updateDeck(editing.classId, editing.id, values)
      showToast('success', `Deck "${values.title.trim()}" updated.`)
      try {
        await logDeckActivity(editing.classId, editing.id, {
          uid,
          name: user?.displayName || user?.email || 'Learner',
        }, summarizeDeckChanges(editing, values))
      } catch {
        showToast('error', 'The deck was saved, but its activity could not be recorded.')
      }
      return
    }
    if (!values.classId) throw new Error('Choose a class for this deck.')
    await createDeck(values.classId, uid, role === 'instructor' ? 'class' : 'personal', values)
    showToast('success', `Deck "${values.title.trim()}" created.`)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleteBusy(true)
    try {
      await deleteDeck(deleteTarget.classId, deleteTarget.id)
      showToast('success', `Deck "${deleteTarget.title}" deleted.`)
      setDeleteTarget(null)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="grid gap-6">
      {error && (
        <Alert tone="error" label="Could not load flashcards">
          {error}
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-navy-900-12 bg-white p-4 shadow-xs">
        <div className="relative min-w-[240px] max-w-md flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-800"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search decks and cards…"
            aria-label="Search flashcard decks"
            className="w-full rounded-xl border border-navy-900-15 bg-navy-900-05 py-2 pl-9 pr-9 text-sm font-medium text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-800"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 inline-flex min-h-8 min-w-8 -translate-y-1/2 items-center justify-center text-navy-800 hover:text-navy-900"
              aria-label="Clear search"
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>

        <Button type="button" variant="primary" onClick={openCreate} disabled={classes.length === 0}>
          <Plus size={16} aria-hidden="true" />
          <span>New deck</span>
        </Button>
      </div>

      {visibleDecks.length === 0 ? (
        <EmptyState
          title={search ? 'No matching decks' : 'No flashcard decks yet'}
          description={
            search
              ? 'Try a different search term or clear the filter.'
              : role === 'instructor'
                ? 'Create a deck of flip cards for your class, then publish it so students can study.'
                : 'Create your own deck of flip cards to practice key terms and ideas.'
          }
          action={
            !search && classes.length > 0 ? (
              <Button type="button" variant="primary" onClick={openCreate}>
                <Plus size={16} aria-hidden="true" />
                <span>Create first deck</span>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
          {visibleDecks.map((deck) => {
            const canEdit = deck.ownerId === uid || deck.sharedRole === 'editor'
            const canShare = deck.ownerId === uid
            return (
              <li
                key={deck.id}
                className="flex flex-col justify-between rounded-3xl border border-navy-900-12 bg-white p-5 shadow-xs"
              >
                <article aria-label={`Deck: ${deck.title}`}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <Badge>{classNames.get(deck.classId) ?? 'Class'}</Badge>
                    <span className="inline-flex items-center gap-1 text-sm text-navy-800">
                      <Calendar size={14} aria-hidden="true" />
                      <span>{formatDate(deck)}</span>
                    </span>
                  </div>
                  <h3 className="mb-1 line-clamp-2 text-base font-bold text-navy-900">
                    {deck.title}
                  </h3>
                  <p className="mb-3 line-clamp-2 min-h-12 text-sm text-navy-800">
                    {deck.description || 'No description.'}
                  </p>
                  <p className="m-0 text-sm font-semibold text-navy-900">
                    {deck.cardCount} {deck.cardCount === 1 ? 'card' : 'cards'} ·{' '}
                    {statusLabel(deck, uid)}
                  </p>
                </article>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-navy-900-08 pt-3">
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => setStudying(deck)}
                    disabled={deck.cardCount === 0}
                  >
                    <Play size={16} aria-hidden="true" />
                    <span>Study</span>
                  </Button>
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => openEdit(deck)}
                        aria-label={`Edit deck "${deck.title}"`}
                      >
                        <Edit3 size={16} aria-hidden="true" />
                        <span>Edit</span>
                      </Button>
                      {deck.ownerId === uid && <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setDeleteTarget(deck)}
                        aria-label={`Delete deck "${deck.title}"`}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </Button>}
                    </div>
                  )}
                  {(canShare || deck.sharedRole) && (
                    <Button type="button" variant="secondary" onClick={() => setSharing(deck)} aria-label={`${canShare ? 'Share' : 'View people and activity for'} deck "${deck.title}"`}>
                      <Link2 size={16} aria-hidden="true" />
                      <span>{canShare ? 'Share' : 'People'}</span>
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {editorOpen && (
        <DeckEditorDialog
          key={editing?.id ?? 'new'}
          role={role}
          classes={classes}
          defaultClassId={defaultClassId}
          deck={editing}
          onSave={handleSave}
          onClose={closeEditor}
        />
      )}

      {studying && <FlashcardStudyDialog deck={studying} onClose={() => setStudying(null)} />}
      {sharing && uid && (
        <DeckShareDialog
          classId={sharing.classId}
          deckId={sharing.id}
          deckTitle={sharing.title}
          ownerId={sharing.ownerId}
          uid={uid}
          name={user?.displayName || user?.email || 'Learner'}
          owner={sharing.ownerId === uid}
          onClose={() => setSharing(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          open
          title="Delete flashcard deck?"
          description={`Are you sure you want to delete "${deleteTarget.title}" and its ${deleteTarget.cardCount} ${deleteTarget.cardCount === 1 ? 'card' : 'cards'}? This cannot be undone.`}
          confirmLabel="Delete deck"
          busy={deleteBusy}
          closeOnConfirm={false}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => void handleDelete()}
        />
      )}
    </div>
  )
}
