import { useRef, useState } from 'react'
import { Sparkles, Square } from 'lucide-react'
import { isAbortError } from '../../../lib/groq/client'
import { getGroqConfigIssue } from '../../../lib/groq/requiredEnv'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { Checkbox } from '../../../shared/ui/Checkbox'
import { Input } from '../../../shared/ui/Input'
import { Textarea } from '../../../shared/ui/Textarea'
import {
  AI_COUNT_PRESETS,
  clampAiCount,
  DEFAULT_AI_CARDS,
  MAX_AI_CARDS,
  MAX_EXTRA_NOTES_CHARS,
  MAX_SELECTED_MODULES,
  MIN_AI_CARDS,
} from '../ai/constants'
import { generateFlashcards } from '../ai/generateCards'
import { buildModuleSource } from '../ai/moduleSource'
import { loadModulesForAi, useClassModules } from '../ai/useClassModules'
import { MAX_DECK_CARDS } from '../constants'
import type { Flashcard } from '../types'

interface AiGeneratePanelProps {
  classId: string
  role: 'instructor' | 'student'
  /** Cards already in the editor that have content; they count toward the deck limit. */
  filledCardCount: number
  onAddCards: (cards: Flashcard[]) => void
}

export function AiGeneratePanel({ classId, role, filledCardCount, onAddCards }: AiGeneratePanelProps) {
  const { modules, error: modulesError, loading } = useClassModules(classId, role)
  const [selected, setSelected] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [countText, setCountText] = useState(String(DEFAULT_AI_CARDS))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const configIssue = getGroqConfigIssue()
  const room = Math.max(0, MAX_DECK_CARDS - filledCardCount)
  const count = Math.min(clampAiCount(Number(countText)), Math.max(room, MIN_AI_CARDS))
  const validSelection = selected.filter((id) => modules.some((m) => m.id === id))
  const hasInput = validSelection.length > 0 || notes.trim().length > 0

  const toggle = (id: string, checked: boolean) =>
    setSelected((current) => {
      if (!checked) return current.filter((item) => item !== id)
      return current.length >= MAX_SELECTED_MODULES ? current : [...current, id]
    })

  const generate = async () => {
    setError(null)
    setNote(null)
    if (room === 0) {
      setError(`This deck is already at the ${MAX_DECK_CARDS}-card limit.`)
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    try {
      const chosen = modules.filter((m) => validSelection.includes(m.id))
      const source = buildModuleSource(await loadModulesForAi(classId, chosen), notes)
      if (!source.hasSubstance) {
        setError(
          'These modules only contain files, videos or links the AI cannot read. Paste the key text into "Extra notes" and try again.',
        )
        return
      }
      const result = await generateFlashcards({ sourceText: source.text, count, signal: controller.signal })
      onAddCards(result.cards)

      const messages = [
        `Added ${result.cards.length} AI ${result.cards.length === 1 ? 'card' : 'cards'}. Review them before saving.`,
      ]
      if (result.cards.length < count) messages.push(`You asked for ${count}; the AI returned fewer usable cards.`)
      if (source.truncated) messages.push('Long modules were shortened to fit.')
      if (source.unreadableResources > 0) {
        messages.push(`${source.unreadableResources} attached file, video or link was used by title only.`)
      }
      setNote(messages.join(' '))
    } catch (err) {
      if (isAbortError(err)) setNote('Generation stopped.')
      else setError(err instanceof Error ? err.message : 'Could not generate cards.')
    } finally {
      abortRef.current = null
      setBusy(false)
    }
  }

  return (
    <details className="rounded-2xl border border-navy-900-12 bg-white p-4">
      <summary className="cursor-pointer text-sm font-bold text-navy-900">
        <Sparkles size={16} className="mr-2 inline" aria-hidden="true" />
        Generate cards with AI from your modules
      </summary>

      <div className="mt-3 grid gap-4">
        {configIssue && (
          <Alert tone="warning" label="AI is not set up">
            {configIssue}
          </Alert>
        )}
        {modulesError && (
          <Alert tone="error" label="Could not load modules">
            {modulesError}
          </Alert>
        )}

        <fieldset className="m-0 grid gap-2 border-0 p-0">
          <legend className="mb-1 text-sm font-bold text-navy-900">
            Import modules (up to {MAX_SELECTED_MODULES})
          </legend>
          {loading ? (
            <p className="m-0 text-sm text-navy-800">Loading modules…</p>
          ) : modules.length === 0 ? (
            <p className="m-0 text-sm text-navy-800">
              {role === 'instructor'
                ? 'This class has no modules yet. Add one in the Modules tab, or paste notes below.'
                : 'No published modules in this class yet. You can still paste notes below.'}
            </p>
          ) : (
            modules.map((module) => {
              const checked = validSelection.includes(module.id)
              return (
                <Checkbox
                  key={module.id}
                  label={module.title}
                  hint={`${module.resourceCount} ${module.resourceCount === 1 ? 'resource' : 'resources'}`}
                  checked={checked}
                  disabled={busy || (!checked && validSelection.length >= MAX_SELECTED_MODULES)}
                  onChange={(event) => toggle(module.id, event.target.checked)}
                />
              )
            })
          )}
        </fieldset>

        <Textarea
          label="Extra notes (optional)"
          hint="The AI reads module descriptions and text resources. Paste anything from Drive files or videos here."
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={MAX_EXTRA_NOTES_CHARS}
          rows={3}
          disabled={busy}
        />

        <div className="grid gap-2">
          <Input
            label={`How many cards? (${MIN_AI_CARDS}–${MAX_AI_CARDS})`}
            type="number"
            inputMode="numeric"
            min={MIN_AI_CARDS}
            max={MAX_AI_CARDS}
            value={countText}
            onChange={(event) => setCountText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.preventDefault()
            }}
            hint={
              room < MAX_AI_CARDS
                ? `Only ${room} more ${room === 1 ? 'card fits' : 'cards fit'} in this deck.`
                : undefined
            }
            disabled={busy}
          />
          <div className="flex flex-wrap gap-2" role="group" aria-label="Quick card counts">
            {AI_COUNT_PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                variant={count === preset ? 'primary' : 'secondary'}
                aria-pressed={count === preset}
                disabled={busy}
                onClick={() => setCountText(String(preset))}
              >
                {preset}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="primary"
            onClick={() => void generate()}
            disabled={busy || Boolean(configIssue) || !hasInput}
          >
            <Sparkles size={16} aria-hidden="true" />
            <span>{busy ? 'Generating…' : `Generate ${count} ${count === 1 ? 'card' : 'cards'}`}</span>
          </Button>
          {busy && (
            <Button type="button" variant="secondary" onClick={() => abortRef.current?.abort()}>
              <Square size={14} aria-hidden="true" />
              <span>Stop</span>
            </Button>
          )}
          {!hasInput && !busy && (
            <span className="text-sm text-navy-800">Choose a module or add notes first.</span>
          )}
        </div>

        {error && (
          <Alert tone="error" label="Could not generate cards">
            {error}
          </Alert>
        )}
        {note && (
          <p className="m-0 text-sm text-navy-800" role="status">
            {note}
          </p>
        )}
      </div>
    </details>
  )
}
