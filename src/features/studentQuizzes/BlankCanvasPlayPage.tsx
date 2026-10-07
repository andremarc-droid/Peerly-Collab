import { ChevronDown, ChevronUp, Link as LinkIcon, MessageSquare, Plus, Share2, StickyNote, Trash2 } from 'lucide-react'
import { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { Dialog } from '../../shared/ui/Dialog'
import { Select } from '../../shared/ui/Select'
import { Skeleton } from '../../shared/ui/Skeleton'
import { CardEditorPanel } from '../canvas/components/CardEditorPanel'
import { ExpandableCanvasContainer } from '../canvas/components/ExpandableCanvasContainer'
import { findNonOverlappingPosition } from '../canvas/placement'
import { normalizeConnection } from '../canvas/schemas'
import type { CanvasAllowedCardType, CanvasCard, CanvasConnection, CanvasQuestion } from '../canvas/types'
import type { BlankCanvasAnswer, BlankCanvasAnswerCard } from '../quizzes/types'

const CanvasBoard = lazy(() => import('../canvas/components/CanvasBoard'))

// In-memory persistence of instructions panel toggle state per attempt
const instructionsStateByAttempt = new Map<string, boolean>()

export interface BlankCanvasPlayPageProps {
  question: CanvasQuestion & { id: string }
  attemptId: string
  quizId?: string
  value?: BlankCanvasAnswer
  onChange: (value: BlankCanvasAnswer) => void
  disabled?: boolean
  className?: string
}

export function BlankCanvasPlayPage({
  question,
  attemptId,
  value,
  onChange,
  disabled = false,
  className = '',
}: BlankCanvasPlayPageProps) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)

  // Default open on first load; remembers state in-memory per attempt
  const [showInstructions, setShowInstructions] = useState(() => {
    if (instructionsStateByAttempt.has(attemptId)) {
      return instructionsStateByAttempt.get(attemptId)!
    }
    return true
  })

  // On screens < 768px, collapse after first board action
  const hasInteractedRef = useRef(false)
  const notifyBoardAction = useCallback(() => {
    if (!hasInteractedRef.current) {
      hasInteractedRef.current = true
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        setShowInstructions(false)
        instructionsStateByAttempt.set(attemptId, false)
      }
    }
  }, [attemptId])

  const handleToggleInstructions = () => {
    setShowInstructions((prev) => {
      const next = !prev
      instructionsStateByAttempt.set(attemptId, next)
      return next
    })
  }

  const [showConnectModal, setShowConnectModal] = useState(false)
  const [connectFrom, setConnectFrom] = useState('')
  const [connectTo, setConnectTo] = useState('')
  const [connectError, setConnectError] = useState<string | null>(null)

  const cards: CanvasCard[] = useMemo(() => {
    return (value?.cards ?? []) as CanvasCard[]
  }, [value?.cards])

  const connections: string[] = useMemo(() => {
    return value?.connections ?? []
  }, [value?.connections])

  const maxCards = question.maxCards ?? 20
  const maxConnections = question.maxConnections ?? 40
  const allowedCardTypes: CanvasAllowedCardType[] = question.allowedCardTypes ?? ['note', 'paragraph', 'link']
  const directed = question.directed ?? false

  const selectedCard = useMemo(
    () => cards.find((c) => c.id === selectedCardId) ?? null,
    [cards, selectedCardId],
  )

  const handleAddCard = (type: CanvasAllowedCardType) => {
    if (disabled || cards.length >= maxCards) return
    notifyBoardAction()
    const id = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    const defaultTitle = type === 'link' ? 'Resource' : type === 'note' ? 'Idea' : 'Summary'
    const pos = findNonOverlappingPosition(cards, { x: 320, y: 160 })
    const newCard: CanvasCard = {
      id,
      type,
      title: defaultTitle,
      content: '',
      position: pos,
    }
    const nextCards = [...cards, newCard]
    setSelectedCardId(id)
    onChange({ cards: nextCards as BlankCanvasAnswerCard[], connections })
  }

  const handleUpdateCard = (field: 'title' | 'content' | 'url' | 'alt', val: string) => {
    if (!selectedCard || disabled) return
    notifyBoardAction()
    const nextCards = cards.map((c) => {
      if (c.id !== selectedCard.id) return c
      return { ...c, [field]: val }
    })
    onChange({ cards: nextCards as BlankCanvasAnswerCard[], connections })
  }

  const handleDeleteCard = (cardId: string) => {
    if (disabled) return
    notifyBoardAction()
    const nextCards = cards.filter((c) => c.id !== cardId)
    const nextConnections = connections.filter((connStr) => {
      const parts = connStr.includes('->') ? connStr.split('->') : connStr.split('<->')
      return parts[0] !== cardId && parts[1] !== cardId
    })
    if (selectedCardId === cardId) {
      setSelectedCardId(null)
    }
    onChange({ cards: nextCards as BlankCanvasAnswerCard[], connections: nextConnections })
  }

  const handlePositionsChange = (positions: Record<string, { x: number; y: number }>) => {
    if (disabled) return
    notifyBoardAction()
    const nextCards = cards.map((c) => {
      const p = positions[c.id]
      return p ? { ...c, position: { x: Math.round(p.x), y: Math.round(p.y) } } : c
    })
    onChange({ cards: nextCards as BlankCanvasAnswerCard[], connections })
  }

  const handleConnectionsChange = (newConns: CanvasConnection[]) => {
    if (disabled) return
    notifyBoardAction()
    const stringList = newConns
      .slice(0, maxConnections)
      .map((c) => normalizeConnection(c.from, c.to, directed))
    onChange({ cards: cards as BlankCanvasAnswerCard[], connections: stringList })
  }

  const handleConnectCards = () => {
    setConnectError(null)
    if (!connectFrom || !connectTo) {
      setConnectError('Select two cards to connect.')
      return
    }
    if (connectFrom === connectTo) {
      setConnectError('Cannot connect a card to itself.')
      return
    }
    if (connections.length >= maxConnections) {
      setConnectError(`Maximum ${maxConnections} connections reached.`)
      return
    }
    const edgeId = normalizeConnection(connectFrom, connectTo, directed)
    if (connections.includes(edgeId)) {
      setConnectError('These cards are already connected.')
      return
    }
    notifyBoardAction()
    const nextConnections = [...connections, edgeId]
    onChange({ cards: cards as BlankCanvasAnswerCard[], connections: nextConnections })
    setConnectFrom('')
    setConnectTo('')
    setShowConnectModal(false)
  }

  const handleDeleteConnection = (connStr: string) => {
    if (disabled) return
    const nextConnections = connections.filter((c) => c !== connStr)
    onChange({ cards: cards as BlankCanvasAnswerCard[], connections: nextConnections })
  }

  const cardLabel = useCallback(
    (cardId: string) => {
      const found = cards.find((c) => c.id === cardId)
      if (!found) return cardId
      return found.title?.trim() || found.content.slice(0, 30) || cardId
    },
    [cards],
  )

  return (
    <div className={`grid gap-4 ${className}`}>
      {/* Collapsible Instructions & Rubric Header */}
      <div className="bg-white rounded-2xl border border-navy-900-12 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="m-0 text-base font-semibold text-navy-900">Task Instructions</h3>
            <Badge color="neutral">
              {cards.length} / {maxCards} cards · {connections.length} / {maxConnections} connections
            </Badge>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={handleToggleInstructions}
            aria-expanded={showInstructions}
          >
            {showInstructions ? (
              <>
                <ChevronUp size={16} aria-hidden="true" /> Hide details
              </>
            ) : (
              <>
                <ChevronDown size={16} aria-hidden="true" /> View instructions & rubric
              </>
            )}
          </Button>
        </div>

        {showInstructions && (
          <div className="mt-4 pt-4 border-t border-navy-900-12 grid gap-3">
            <div>
              <span className="block text-sm font-semibold uppercase tracking-wider text-navy-800-72">Prompt</span>
              <p className="m-0 mt-1 whitespace-pre-wrap text-base text-navy-900 leading-relaxed font-body">
                {question.prompt}
              </p>
            </div>
            {question.showRubricToStudents && question.rubric && (
              <div className="pt-2 border-t border-navy-900-12">
                <span className="block text-sm font-semibold uppercase tracking-wider text-navy-800-72">Rubric</span>
                <p className="m-0 mt-1 whitespace-pre-wrap text-sm text-navy-900 leading-relaxed">
                  {question.rubric}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Play Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white rounded-2xl border border-navy-900-12 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-navy-900 mr-1">Add card:</span>
          {allowedCardTypes.includes('note') && (
            <Button
              type="button"
              variant="secondary"
              disabled={disabled || cards.length >= maxCards}
              onClick={() => handleAddCard('note')}
            >
              <StickyNote size={15} aria-hidden="true" /> Note
            </Button>
          )}
          {allowedCardTypes.includes('paragraph') && (
            <Button
              type="button"
              variant="secondary"
              disabled={disabled || cards.length >= maxCards}
              onClick={() => handleAddCard('paragraph')}
            >
              <MessageSquare size={15} aria-hidden="true" /> Paragraph
            </Button>
          )}
          {allowedCardTypes.includes('link') && (
            <Button
              type="button"
              variant="secondary"
              disabled={disabled || cards.length >= maxCards}
              onClick={() => handleAddCard('link')}
            >
              <LinkIcon size={15} aria-hidden="true" /> Link
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || cards.length < 2 || connections.length >= maxConnections}
            onClick={() => {
              setConnectError(null)
              setShowConnectModal(true)
            }}
          >
            <Share2 size={15} aria-hidden="true" /> Connect cards
          </Button>
        </div>
      </div>

      {/* Board & Side Editor Layout */}
      <ExpandableCanvasContainer title="Concept map canvas">
        <div className="relative flex-1 min-w-0 w-full h-full bg-white rounded-3xl border border-navy-900-12 overflow-hidden shadow-sm">
          {cards.length === 0 && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center pointer-events-none bg-white/70">
              <div className="max-w-md p-6 bg-white rounded-2xl border border-navy-900-12 shadow-sm pointer-events-auto">
                <h4 className="m-0 text-base font-semibold text-navy-900">Your board is empty</h4>
                <p className="mt-2 text-sm text-navy-800 leading-relaxed">
                  Use the toolbar above to add notes, paragraphs, or links. Drag cards to arrange them, and connect them by dragging from edge handles.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {allowedCardTypes.map((type) => (
                    <Button
                      key={type}
                      type="button"
                      variant="primary"
                      onClick={() => handleAddCard(type)}
                    >
                      <Plus size={15} aria-hidden="true" /> Add {type}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <Suspense fallback={<Skeleton label="Loading canvas board" className="w-full h-full" />}>
            <CanvasBoard
              cards={cards}
              connections={connections}
              mode={disabled ? 'play' : 'edit'}
              directed={directed}
              maxConnections={maxConnections}
              onCardClick={(c) => setSelectedCardId(c.id)}
              onPositionsChange={handlePositionsChange}
              onConnectionsChange={handleConnectionsChange}
              onCardsChange={(remaining) => {
                if (disabled) return
                const remainingIds = new Set(remaining.map((c) => c.id))
                const nextConns = connections.filter((connStr) => {
                  const parts = connStr.includes('->') ? connStr.split('->') : connStr.split('<->')
                  return remainingIds.has(parts[0]) && remainingIds.has(parts[1])
                })
                onChange({ cards: remaining as BlankCanvasAnswerCard[], connections: nextConns })
              }}
              className="w-full h-full"
            />
          </Suspense>
        </div>

        {selectedCard && (
          <CardEditorPanel
            card={selectedCard}
            readOnly={disabled}
            onUpdate={handleUpdateCard}
            onDelete={() => handleDeleteCard(selectedCard.id)}
            onClose={() => setSelectedCardId(null)}
          />
        )}
      </ExpandableCanvasContainer>

      {/* Connect Cards Dialog */}
      <Dialog
        open={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        title="Connect cards"
        description="Select two cards to connect together."
      >
        <div className="grid gap-4 py-2">
          {connectError && (
            <p className="m-0 text-sm font-semibold text-feedback-error">{connectError}</p>
          )}
          <Select
            label="Source card"
            name="connect-from"
            value={connectFrom}
            onChange={(e) => setConnectFrom(e.target.value)}
            options={[
              { value: '', label: 'Select starting card' },
              ...cards.map((c) => ({ value: c.id, label: cardLabel(c.id) })),
            ]}
          />
          <Select
            label="Target card"
            name="connect-to"
            value={connectTo}
            onChange={(e) => setConnectTo(e.target.value)}
            options={[
              { value: '', label: 'Select destination card' },
              ...cards
                .filter((c) => c.id !== connectFrom)
                .map((c) => ({ value: c.id, label: cardLabel(c.id) })),
            ]}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowConnectModal(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleConnectCards}>
              Create connection
            </Button>
          </div>

          {connections.length > 0 && (
            <div className="mt-4 pt-4 border-t border-navy-900-12">
              <h4 className="m-0 text-sm font-semibold text-navy-900 mb-2">
                Existing connections ({connections.length})
              </h4>
              <ul className="grid gap-2 max-h-48 overflow-y-auto p-0 list-none m-0">
                {connections.map((connStr) => {
                  const parts = connStr.split(directed ? '->' : '<->')
                  const fromLabel = cardLabel(parts[0])
                  const toLabel = cardLabel(parts[1])
                  return (
                    <li
                      key={connStr}
                      className="flex items-center justify-between p-2 rounded-xl bg-navy-900-5 border border-navy-900-12 text-sm"
                    >
                      <span className="truncate mr-2 font-medium text-navy-900">
                        {fromLabel} {directed ? '→' : '—'} {toLabel}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-[36px] min-w-[36px] p-1 text-navy-700 hover:text-feedback-error"
                        onClick={() => handleDeleteConnection(connStr)}
                        aria-label={`Delete connection between ${fromLabel} and ${toLabel}`}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  )
}
