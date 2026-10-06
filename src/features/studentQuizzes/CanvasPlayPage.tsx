import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { Dialog } from '../../shared/ui/Dialog'
import { Select } from '../../shared/ui/Select'
import { Skeleton } from '../../shared/ui/Skeleton'
import { normalizeConnection, parseConnectionEdge, scatterCards } from '../canvas/schemas'
import type { CanvasCard, CanvasConnection, CanvasQuestion } from '../canvas/types'

const CanvasBoard = lazy(() => import('../canvas/components/CanvasBoard'))

export interface CanvasPlayPageProps {
  question: CanvasQuestion & { id: string }
  attemptId: string
  connections?: string[]
  onChange: (connections: string[]) => void
  disabled?: boolean
  className?: string
}

export function CanvasPlayPage({
  question,
  attemptId,
  connections = [],
  onChange,
  disabled = false,
  className = '',
}: CanvasPlayPageProps) {
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [connectFrom, setConnectFrom] = useState('')
  const [connectTo, setConnectTo] = useState('')
  const [connectError, setConnectError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')

  // Stable layout: fixed uses author coordinates, scattered uses scatterCards seeded with attemptId
  const displayCards: CanvasCard[] = useMemo(() => {
    if (question.layoutMode === 'fixed') {
      return question.cards
    }
    return scatterCards(question.cards, attemptId, { width: 1200, height: 900 })
  }, [question.layoutMode, question.cards, attemptId])

  const cardLabel = useCallback(
    (cardId: string) => {
      const card = displayCards.find((c) => c.id === cardId)
      if (!card) return cardId
      return card.title?.trim() || card.content.slice(0, 30) || card.id
    },
    [displayCards],
  )

  // Handle board connection additions and deletions (drag & drop or delete key)
  const handleBoardConnectionsChange = useCallback(
    (newConnections: CanvasConnection[]) => {
      if (disabled) return
      const mapped = newConnections.map((c) => normalizeConnection(c.from, c.to, question.directed))
      // Deduplicate and cap at 80
      const unique = Array.from(new Set(mapped)).slice(0, 80)
      onChange(unique)
    },
    [disabled, question.directed, onChange],
  )

  // Keyboard/touch alternative: add connection via dialog
  const handleAddAccessibleConnection = useCallback(() => {
    if (!connectFrom || !connectTo || connectFrom === connectTo) {
      setConnectError('Select two different cards to connect.')
      return
    }

    if (connections.length >= 80) {
      setConnectError('Maximum limit of 80 connections reached.')
      return
    }

    const norm = normalizeConnection(connectFrom, connectTo, question.directed)
    const alreadyConnected = connections.some((existing) => {
      const parsed = parseConnectionEdge(existing)
      if (!parsed) return existing === norm
      return normalizeConnection(parsed.from, parsed.to, question.directed) === norm
    })

    if (alreadyConnected) {
      setConnectError('These cards are already connected.')
      return
    }

    const next = [...connections, norm]
    onChange(next)
    const fromName = cardLabel(connectFrom)
    const toName = cardLabel(connectTo)
    setAnnouncement(`Connected ${fromName} to ${toName}.`)
    setShowConnectModal(false)
    setConnectFrom('')
    setConnectTo('')
    setConnectError(null)
  }, [connectFrom, connectTo, connections, question.directed, onChange, cardLabel])

  // Keyboard/touch alternative: remove connection via button
  const handleRemoveConnection = useCallback(
    (connStr: string) => {
      if (disabled) return
      const parsed = parseConnectionEdge(connStr)
      const fromName = parsed ? cardLabel(parsed.from) : ''
      const toName = parsed ? cardLabel(parsed.to) : ''
      const next = connections.filter((c) => c !== connStr)
      onChange(next)
      setAnnouncement(
        fromName && toName
          ? `Removed connection between ${fromName} and ${toName}.`
          : 'Connection removed.',
      )
    },
    [disabled, connections, onChange, cardLabel],
  )

  const connectCardsSlot = (
    <Button
      type="button"
      variant="secondary"
      onClick={() => {
        setConnectError(null)
        setShowConnectModal(true)
      }}
      disabled={disabled || displayCards.length < 2 || connections.length >= 80}
      aria-label="Connect cards dialog"
    >
      Connect cards
    </Button>
  )

  return (
    <div className={`canvas-play-page grid gap-4 ${className}`}>
      {/* Polite live region for accessibility announcements */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {/* Main Canvas Board with controls and live counter */}
      <div className="relative h-[550px] w-full overflow-hidden rounded-2xl border border-navy-900-12 bg-surface-primary">
        <Suspense fallback={<Skeleton className="h-full w-full rounded-2xl" label="Loading canvas board" />}>
          <CanvasBoard
            cards={displayCards}
            connections={connections}
            mode="play"
            directed={question.directed}
            maxConnections={80}
            positions={positions}
            onPositionsChange={setPositions}
            onConnectionsChange={handleBoardConnectionsChange}
            connectCardsDialogSlot={connectCardsSlot}
          />
        </Suspense>
      </div>

      {/* Current Connections list (Keyboard and Touch accessible alternative) */}
      <section
        className="canvas-connections-list grid gap-3 rounded-2xl border border-navy-900-12 bg-white p-4 sm:p-5"
        aria-labelledby="connections-heading"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 id="connections-heading" className="m-0 text-base font-semibold text-navy-900">
              Connections ({connections.length} of 80)
            </h3>
            <p className="m-0 text-xs text-navy-800-72">
              Connect cards that belong together. Drag handles on the board or use the connect button.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setConnectError(null)
              setShowConnectModal(true)
            }}
            disabled={disabled || displayCards.length < 2 || connections.length >= 80}
          >
            Connect cards
          </Button>
        </div>

        {connections.length === 0 ? (
          <p className="m-0 text-sm text-navy-800-72 italic">
            No connections made yet. Link cards that belong together.
          </p>
        ) : (
          <ul className="grid gap-2 p-0 list-none m-0 max-h-60 overflow-y-auto" aria-label="Current connections list">
            {connections.map((connStr) => {
              const parsed = parseConnectionEdge(connStr)
              const fromName = parsed ? cardLabel(parsed.from) : 'Card'
              const toName = parsed ? cardLabel(parsed.to) : 'Card'
              const separator = question.directed ? '→' : '—'

              return (
                <li
                  key={connStr}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-navy-900-8 bg-surface-secondary px-3 py-2 text-sm"
                >
                  <span className="font-medium text-navy-900">
                    <span>{fromName}</span>
                    <span className="mx-2 text-navy-800-72 font-normal" aria-hidden="true">
                      {separator}
                    </span>
                    <span>{toName}</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => handleRemoveConnection(connStr)}
                    aria-label={`Remove connection between ${fromName} and ${toName}`}
                    className="text-xs"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    <span>Remove</span>
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Accessible Connect Cards Dialog */}
      <Dialog
        open={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        title="Connect cards"
        description="Select a source card and target card to create a connection."
      >
        <div className="grid gap-4">
          {connectError && (
            <Alert tone="error" label="Could not create connection">
              {connectError}
            </Alert>
          )}

          <Select
            label="From card"
            name="play-connect-from"
            value={connectFrom}
            onChange={(e) => {
              setConnectFrom(e.target.value)
              setConnectError(null)
            }}
            options={[
              { value: '', label: 'Select source card' },
              ...displayCards.map((c) => ({
                value: c.id,
                label: c.title?.trim() || c.content.slice(0, 35) || c.id,
              })),
            ]}
          />

          <Select
            label="To card"
            name="play-connect-to"
            value={connectTo}
            onChange={(e) => {
              setConnectTo(e.target.value)
              setConnectError(null)
            }}
            options={[
              { value: '', label: 'Select target card' },
              ...displayCards.map((c) => ({
                value: c.id,
                label: c.title?.trim() || c.content.slice(0, 35) || c.id,
              })),
            ]}
          />

          <div className="dialog__actions">
            <Button type="button" variant="secondary" onClick={() => setShowConnectModal(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAddAccessibleConnection}
              disabled={!connectFrom || !connectTo || connectFrom === connectTo}
            >
              Create connection
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
export default CanvasPlayPage
