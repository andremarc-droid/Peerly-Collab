import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { Dialog } from '../../../shared/ui/Dialog'
import { Input } from '../../../shared/ui/Input'
import { Textarea } from '../../../shared/ui/Textarea'
import { parseBulkCards } from '../bulkParse'
import { AiGeneratePanel } from './AiGeneratePanel'
import {
  MAX_CARD_BACK_LENGTH,
  MAX_CARD_FRONT_LENGTH,
  MAX_DECK_CARDS,
  MAX_DECK_DESCRIPTION_LENGTH,
  MAX_DECK_TITLE_LENGTH,
} from '../constants'
import { newCardId } from '../schemas'
import type { Flashcard, FlashcardDeckInput, FlashcardDeckWithId } from '../types'

export interface DeckEditorValues extends FlashcardDeckInput {
  classId: string
}

interface DeckEditorDialogProps {
  role: 'instructor' | 'student'
  classes: Array<{ id: string; name: string }>
  defaultClassId: string
  deck: FlashcardDeckWithId | null
  onSave: (values: DeckEditorValues) => Promise<void>
  onClose: () => void
}

const blankCard = (): Flashcard => ({ id: newCardId(), front: '', back: '' })

export function DeckEditorDialog({
  role,
  classes,
  defaultClassId,
  deck,
  onSave,
  onClose,
}: DeckEditorDialogProps) {
  const [classId, setClassId] = useState(deck?.classId ?? defaultClassId)
  const [title, setTitle] = useState(deck?.title ?? '')
  const [description, setDescription] = useState(deck?.description ?? '')
  const [published, setPublished] = useState(deck?.status === 'published')
  const [rows, setRows] = useState<Flashcard[]>(() =>
    deck ? deck.cards.map((card) => ({ ...card })) : [blankCard(), blankCard(), blankCard()],
  )
  const [bulkText, setBulkText] = useState('')
  const [bulkNote, setBulkNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const isEditing = deck !== null
  const atLimit = rows.length >= MAX_DECK_CARDS

  const updateRow = (id: string, patch: Partial<Flashcard>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)))

  const removeRow = (id: string) =>
    setRows((current) => (current.length > 1 ? current.filter((row) => row.id !== id) : current))

  const addRow = () => setRows((current) => (current.length < MAX_DECK_CARDS ? [...current, blankCard()] : current))

  const addBulk = () => {
    const { cards, skipped } = parseBulkCards(bulkText)
    if (cards.length === 0) {
      setBulkNote(
        skipped > 0
          ? `No cards added. ${skipped} ${skipped === 1 ? 'line was' : 'lines were'} skipped.`
          : 'Paste at least one line like "Term :: Definition".',
      )
      return
    }
    const room = MAX_DECK_CARDS - rows.filter((r) => r.front.trim() || r.back.trim()).length
    const accepted = cards.slice(0, Math.max(room, 0))
    const dropped = cards.length - accepted.length
    setRows((current) => [
      ...current.filter((row) => row.front.trim() || row.back.trim()),
      ...accepted,
    ])
    setBulkText('')
    const notes = [`Added ${accepted.length} ${accepted.length === 1 ? 'card' : 'cards'}.`]
    if (skipped > 0) notes.push(`${skipped} ${skipped === 1 ? 'line was' : 'lines were'} skipped.`)
    if (dropped > 0) notes.push(`${dropped} over the ${MAX_DECK_CARDS}-card limit.`)
    setBulkNote(notes.join(' '))
  }

  const filledCount = rows.filter((row) => row.front.trim() || row.back.trim()).length

  const addAiCards = (cards: Flashcard[]) =>
    setRows((current) => {
      const kept = current.filter((row) => row.front.trim() || row.back.trim())
      return [...kept, ...cards.slice(0, Math.max(MAX_DECK_CARDS - kept.length, 0))]
    })

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await onSave({ classId, title, description, cards: rows, published })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this deck.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEditing ? 'Edit flashcard deck' : 'New flashcard deck'}
      description={
        role === 'instructor'
          ? 'Write the cards your students will study. Publish the deck when it is ready.'
          : 'Write your own cards. Only you can see this deck.'
      }
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        {error && (
          <Alert tone="error" label="Could not save deck">
            {error}
          </Alert>
        )}

        {!isEditing && classes.length > 1 && (
          <label className="field" htmlFor="deck-class">
            <span className="field__label">Class</span>
            <select
              id="deck-class"
              className="field__control"
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <Input
          label="Deck title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={MAX_DECK_TITLE_LENGTH}
          placeholder="e.g. Cell biology key terms"
          required
        />

        <Textarea
          label="Description (optional)"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={MAX_DECK_DESCRIPTION_LENGTH}
          rows={2}
        />

        {role === 'instructor' && (
          <label className="field" htmlFor="deck-visibility">
            <span className="field__label">Visibility</span>
            <select
              id="deck-visibility"
              className="field__control"
              value={published ? 'published' : 'draft'}
              onChange={(event) => setPublished(event.target.value === 'published')}
            >
              <option value="draft">Draft: only you can see it</option>
              <option value="published">Published: students in this class can study it</option>
            </select>
          </label>
        )}

        <section aria-labelledby="deck-cards-heading" className="grid gap-3">
          <div className="flex items-center justify-between gap-2">
            <h3 id="deck-cards-heading" className="m-0 text-base font-bold text-navy-900">
              Cards
            </h3>
            <span className="text-sm text-navy-800">
              {rows.length} / {MAX_DECK_CARDS}
            </span>
          </div>

          <ol className="m-0 grid list-none gap-3 p-0">
            {rows.map((row, index) => (
              <li
                key={row.id}
                className="grid gap-3 rounded-2xl border border-navy-900-12 bg-white p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-navy-900">Card {index + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => removeRow(row.id)}
                    disabled={rows.length === 1}
                    aria-label={`Remove card ${index + 1}`}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </Button>
                </div>
                <Textarea
                  label={`Card ${index + 1} front (question or term)`}
                  value={row.front}
                  onChange={(event) => updateRow(row.id, { front: event.target.value })}
                  maxLength={MAX_CARD_FRONT_LENGTH}
                  rows={2}
                />
                <Textarea
                  label={`Card ${index + 1} back (answer or definition)`}
                  value={row.back}
                  onChange={(event) => updateRow(row.id, { back: event.target.value })}
                  maxLength={MAX_CARD_BACK_LENGTH}
                  rows={3}
                />
              </li>
            ))}
          </ol>

          <Button type="button" variant="secondary" onClick={addRow} disabled={atLimit}>
            <Plus size={16} aria-hidden="true" />
            <span>Add card</span>
          </Button>

          <AiGeneratePanel
            classId={classId}
            role={role}
            filledCardCount={filledCount}
            onAddCards={addAiCards}
          />

          <details className="rounded-2xl border border-navy-900-12 bg-white p-4">
            <summary className="cursor-pointer text-sm font-bold text-navy-900">
              Paste many cards at once
            </summary>
            <div className="mt-3 grid gap-3">
              <Textarea
                label="One card per line"
                hint='Separate the front and back with "::" or a tab, e.g. Mitochondria :: Powerhouse of the cell'
                value={bulkText}
                onChange={(event) => setBulkText(event.target.value)}
                rows={5}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="secondary" onClick={addBulk} disabled={atLimit}>
                  Add pasted cards
                </Button>
                {bulkNote && (
                  <span className="text-sm text-navy-800" role="status">
                    {bulkNote}
                  </span>
                )}
              </div>
            </div>
          </details>
        </section>

        <div className="dialog__actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !title.trim()}>
            {busy ? 'Saving…' : isEditing ? 'Save changes' : 'Create deck'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
