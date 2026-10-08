import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { HelpCircle, Trash2 } from 'lucide-react'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { Dialog } from '../../shared/ui/Dialog'
import { Select } from '../../shared/ui/Select'
import { Skeleton } from '../../shared/ui/Skeleton'
import { sanitizeCanvasAnswers } from '../canvas/mapping'
import { normalizeConnection, parseConnectionEdge, scatterCards } from '../canvas/schemas'
import { toDataUrl } from '../canvas/imageProcessing'
import { listImages } from '../canvas/imageService'
import { ExpandableCanvasContainer } from '../canvas/components/ExpandableCanvasContainer'
import type { CanvasCard, CanvasConnection, CanvasQuestion } from '../canvas/types'

const CanvasBoard = lazy(() => import('../canvas/components/CanvasBoard'))

export interface CanvasPlayPageProps {
  question: CanvasQuestion & { id: string }
  attemptId: string
  quizId?: string
  connections?: string[]
  onChange: (connections: string[]) => void
  disabled?: boolean
  className?: string
  showInstructions?: boolean
}

export function CanvasPlayPage({
  question,
  attemptId,
  quizId,
  connections = [],
  onChange,
  disabled = false,
  className = '',
  showInstructions = false,
}: CanvasPlayPageProps) {
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [connectFrom, setConnectFrom] = useState('')
  const [connectTo, setConnectTo] = useState('')
  const [connectError, setConnectError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')

  // Images state
  const [images, setImages] = useState<Record<string, { dataUrl: string; alt?: string }>>({})
  const [imagesError, setImagesError] = useState(false)
  const [imagesLoading, setImagesLoading] = useState(false)

  const hasImages = useMemo(
    () => question.cards.some((c) => c.type === 'image' && c.imageId),
    [question.cards],
  )

  const loadImages = useCallback(async () => {
    if (!quizId || !hasImages) return
    setImagesLoading(true)
    setImagesError(false)
    try {
      const imgList = await listImages(quizId)
      const rec: Record<string, { dataUrl: string; alt?: string }> = {}
      imgList.forEach((img) => {
        rec[img.id] = { dataUrl: toDataUrl(img.mimeType, img.data) }
      })
      question.cards.forEach((c) => {
        if (c.type === 'image' && c.imageId && rec[c.imageId]) {
          rec[c.imageId].alt = c.alt
        }
      })
      setImages(rec)
    } catch {
      setImagesError(true)
    } finally {
      setImagesLoading(false)
    }
  }, [quizId, hasImages, question.cards])

  useEffect(() => {
    void loadImages()
  }, [loadImages])

  const validCardIds = useMemo(
    () => new Set(question.cards.map((c) => c.id)),
    [question.cards],
  )

  // Sanitize incoming connections from attempt state
  const sanitizedConnections = useMemo(
    () => sanitizeCanvasAnswers(connections, validCardIds, question.directed),
    [connections, validCardIds, question.directed],
  )

  // Repair corrupted or un-normalized saved answers on resume or when loaded
  useEffect(() => {
    if (connections.length > 0) {
      const isCorruptedOrDifferent =
        sanitizedConnections.length !== connections.length ||
        sanitizedConnections.some((c, i) => c !== connections[i])

      if (isCorruptedOrDifferent) {
        onChange(sanitizedConnections)
      }
    }
  }, [connections, sanitizedConnections, onChange])

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
      const sanitized = sanitizeCanvasAnswers(newConnections, validCardIds, question.directed)
      onChange(sanitized)
    },
    [disabled, validCardIds, question.directed, onChange],
  )

  // Keyboard/touch alternative: add connection via dialog
  const handleAddAccessibleConnection = useCallback(() => {
    if (!connectFrom || !connectTo || connectFrom === connectTo) {
      setConnectError('Select two different cards to connect.')
      return
    }

    if (!validCardIds.has(connectFrom) || !validCardIds.has(connectTo)) {
      setConnectError('Selected cards are invalid.')
      return
    }

    if (sanitizedConnections.length >= 80) {
      setConnectError('Maximum limit of 80 connections reached.')
      return
    }

    const norm = normalizeConnection(connectFrom, connectTo, question.directed ?? true)
    if (sanitizedConnections.includes(norm)) {
      setConnectError('These cards are already connected.')
      return
    }

    const next = sanitizeCanvasAnswers(
      [...sanitizedConnections, norm],
      validCardIds,
      question.directed ?? true,
    )
    onChange(next)
    const fromName = cardLabel(connectFrom)
    const toName = cardLabel(connectTo)
    setAnnouncement(`Connected ${fromName} to ${toName}.`)
    setShowConnectModal(false)
    setConnectFrom('')
    setConnectTo('')
    setConnectError(null)
  }, [
    connectFrom,
    connectTo,
    validCardIds,
    sanitizedConnections,
    question.directed,
    onChange,
    cardLabel,
  ])

  // Keyboard/touch alternative: remove connection via button
  const handleRemoveConnection = useCallback(
    (connStr: string) => {
      if (disabled) return
      const parsed = parseConnectionEdge(connStr)
      const fromName = parsed ? cardLabel(parsed.from) : ''
      const toName = parsed ? cardLabel(parsed.to) : ''
      const norm = parsed ? normalizeConnection(parsed.from, parsed.to, question.directed ?? true) : connStr
      const next = sanitizedConnections.filter((c) => c !== connStr && c !== norm)
      onChange(sanitizeCanvasAnswers(next, validCardIds, question.directed ?? true))
      setAnnouncement(
        fromName && toName
          ? `Removed connection between ${fromName} and ${toName}.`
          : 'Connection removed.',
      )
    },
    [disabled, sanitizedConnections, validCardIds, question.directed, onChange, cardLabel],
  )

  const connectCardsSlot = (
    <Button
      type="button"
      variant="secondary"
      onClick={() => {
        setConnectError(null)
        setShowConnectModal(true)
      }}
      disabled={disabled || displayCards.length < 2 || sanitizedConnections.length >= 80}
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

      {/* Activity instructions banner */}
      {showInstructions && question.prompt && (
        <div
          className="rounded-2xl border border-navy-900-12 bg-white p-4 shadow-sm"
          role="region"
          aria-label="Activity instructions"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-navy-50 p-1.5 text-navy-800 flex-shrink-0" aria-hidden="true">
              <HelpCircle size={18} />
            </div>
            <div className="min-w-0">
              <span className="block text-sm font-bold uppercase tracking-wider text-navy-800-72">
                Instructions
              </span>
              <p className="m-0 text-base font-medium text-navy-900 break-words whitespace-pre-wrap">
                {question.prompt}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Canvas Board with controls and live counter - responsive height */}
      <ExpandableCanvasContainer title="Canvas board">
        <div className="relative w-full h-full overflow-hidden rounded-2xl border border-navy-900-12 bg-surface-primary">
          <Suspense fallback={<Skeleton className="h-full w-full rounded-2xl" label="Loading canvas board" />}>
            <CanvasBoard
              cards={displayCards}
              connections={sanitizedConnections}
              mode="play"
              directed={question.directed}
              maxConnections={80}
              positions={positions}
              images={images}
              onPositionsChange={setPositions}
              onConnectionsChange={handleBoardConnectionsChange}
              connectCardsDialogSlot={connectCardsSlot}
              className="w-full h-full"
            />
          </Suspense>
        </div>
      </ExpandableCanvasContainer>

      {imagesError && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-navy-800 bg-navy-50 border border-navy-900-12 rounded-xl px-3 py-2" role="status">
          <span>Some board images could not be loaded.</span>
          <button
            type="button"
            onClick={() => void loadImages()}
            disabled={imagesLoading}
            className="min-h-11 px-2 underline font-medium hover:text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-600 rounded"
          >
            {imagesLoading ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      )}

      {/* Current Connections list (Keyboard and Touch accessible alternative) */}
      <section
        className="canvas-connections-list grid gap-3 rounded-2xl border border-navy-900-12 bg-white p-4 sm:p-5"
        aria-labelledby="connections-heading"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 id="connections-heading" className="m-0 text-base font-semibold text-navy-900">
              Connections ({sanitizedConnections.length} of 80)
            </h3>
            <p className="m-0 text-sm text-navy-800-72">
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
            disabled={disabled || displayCards.length < 2 || sanitizedConnections.length >= 80}
          >
            Connect cards
          </Button>
        </div>

        {sanitizedConnections.length === 0 ? (
          <p className="m-0 text-sm text-navy-800-72 italic">
            No connections made yet. Link cards that belong together.
          </p>
        ) : (
          <ul className="grid gap-2 p-0 list-none m-0 max-h-60 overflow-y-auto" aria-label="Current connections list">
            {sanitizedConnections.map((connStr) => {
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
                    className="text-sm"
                  >
                    <Trash2 size={16} aria-hidden="true" />
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
