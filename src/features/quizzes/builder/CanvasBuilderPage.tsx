import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  Plus,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../../../app/AppShell'
import { useAuth } from '../../auth/useAuth'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { Dialog } from '../../../shared/ui/Dialog'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { Input } from '../../../shared/ui/Input'
import { PageHeader } from '../../../shared/ui/PageHeader'
import { Select } from '../../../shared/ui/Select'
import { Textarea } from '../../../shared/ui/Textarea'
import { useToast } from '../../../shared/ui/useToast'
import { useUnsavedChangesGuard } from '../../../shared/ui/useUnsavedChangesGuard'
import CanvasBoard from '../../canvas/components/CanvasBoard'
import { normalizeGenericUrl, parseDriveUrl } from '../../modules/links'
import {
  normalizeConnection,
  renormalizeConnections,
  validateCanvasDefinition,
  validateCanvasKey,
} from '../../canvas/schemas'
import type {
  CanvasAnswerKey,
  CanvasCard,
  CanvasCardType,
  CanvasConnection,
  CanvasLayoutMode,
  CanvasQuestion,
  CanvasWrongPenalty,
} from '../../canvas/types'
import { getQuestionWithKey, getQuiz, saveQuestionAndKey } from '../services'

export default function CanvasBuilderPage({ quizId: propQuizId }: { quizId?: string }) {
  const params = useParams()
  const quizId = propQuizId || params.quizId || ''
  const navigate = useNavigate()
  const { user } = useAuth()
  const { showToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [quizTitle, setQuizTitle] = useState('')

  // Board question state
  const [prompt, setPrompt] = useState('Connect related concepts on the board.')
  const [points, setPoints] = useState(100)
  const [layoutMode, setLayoutMode] = useState<CanvasLayoutMode>('scattered')
  const [directed, setDirected] = useState(true)
  const [wrongPenalty, setWrongPenalty] = useState<CanvasWrongPenalty>('half')
  const [cards, setCards] = useState<CanvasCard[]>([])
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})

  // Answer key state
  const [connections, setConnections] = useState<CanvasConnection[]>([])
  const [explanation, setExplanation] = useState('')

  // UI state
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [showSettingsPanel, setShowSettingsPanel] = useState(false)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [connectFrom, setConnectFrom] = useState('')
  const [connectTo, setConnectTo] = useState('')
  const [connectPoints, setConnectPoints] = useState(1)
  const [connectError, setConnectError] = useState<string | null>(null)

  // Save state
  const [savedSignature, setSavedSignature] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [leaveModalOpen, setLeaveModalOpen] = useState(false)
  const [pendingLeaveTarget, setPendingLeaveTarget] = useState<string | null>(null)
  const [pendingDirectedMode, setPendingDirectedMode] = useState<boolean | null>(null)

  const currentSignature = useMemo(() => {
    return JSON.stringify({
      prompt,
      points,
      layoutMode,
      directed,
      wrongPenalty,
      explanation,
      cards: cards.map((c) => ({
        id: c.id,
        type: c.type,
        title: c.title,
        content: c.content,
        url: c.url,
        position: positions[c.id] ?? c.position,
      })),
      connections: connections.map((c) => ({
        id: c.id,
        from: c.from,
        to: c.to,
        points: c.points,
      })),
    })
  }, [prompt, points, layoutMode, directed, wrongPenalty, explanation, cards, positions, connections])

  const isDirty = savedSignature !== '' && currentSignature !== savedSignature
  const totalWeight = useMemo(
    () => connections.reduce((sum, c) => sum + (c.points ?? 1), 0),
    [connections],
  )

  // Load quiz and existing 'board' question / answer key
  useEffect(() => {
    if (!quizId) return
    let active = true

    async function loadData() {
      try {
        const quiz = await getQuiz(quizId)
        if (!active) return
        if (!quiz || (user && quiz.ownerId !== user.uid)) {
          setLoadError('This quiz is unavailable or you do not have permission to edit it.')
          setLoading(false)
          return
        }
        setQuizTitle(quiz.title || 'Untitled canvas')

        const existingPair = await getQuestionWithKey(quizId, 'board')
        if (!active) return

        if (existingPair) {
          const q = existingPair.question as CanvasQuestion
          const k = existingPair.answerKey as CanvasAnswerKey
          setPrompt(q.prompt || 'Connect related concepts on the board.')
          setPoints(q.points ?? 100)
          setLayoutMode(q.layoutMode ?? 'scattered')
          setDirected(q.directed ?? true)
          setWrongPenalty(q.wrongPenalty ?? 'half')
          setCards(q.cards ?? [])

          const loadedPositions: Record<string, { x: number; y: number }> = {}
          q.cards?.forEach((c) => {
            loadedPositions[c.id] = c.position
          })
          setPositions(loadedPositions)

          setConnections(k.connections ?? [])
          setExplanation(k.explanation ?? '')

          const sig = JSON.stringify({
            prompt: q.prompt || 'Connect related concepts on the board.',
            points: q.points ?? 100,
            layoutMode: q.layoutMode ?? 'scattered',
            directed: q.directed ?? true,
            wrongPenalty: q.wrongPenalty ?? 'half',
            explanation: k.explanation ?? '',
            cards: (q.cards ?? []).map((c) => ({
              id: c.id,
              type: c.type,
              title: c.title,
              content: c.content,
              url: c.url,
              position: c.position,
            })),
            connections: (k.connections ?? []).map((c) => ({
              id: c.id,
              from: c.from,
              to: c.to,
              points: c.points,
            })),
          })
          setSavedSignature(sig)
        } else {
          // New board question initial signature
          const sig = JSON.stringify({
            prompt: 'Connect related concepts on the board.',
            points: 100,
            layoutMode: 'scattered',
            directed: true,
            wrongPenalty: 'half',
            explanation: '',
            cards: [],
            connections: [],
          })
          setSavedSignature(sig)
        }
        setLoading(false)
      } catch (err) {
        if (!active) return
        setLoadError(err instanceof Error ? err.message : 'Could not load canvas data.')
        setLoading(false)
      }
    }

    void loadData()
    return () => {
      active = false
    }
  }, [quizId, user])

  // Leave-with-unsaved-changes guard for in-app links, browser back, and beforeunload
  useUnsavedChangesGuard(isDirty)

  // Validation in plain language
  const validationErrors = useMemo(() => {
    const errors: string[] = []
    if (!prompt.trim()) {
      errors.push('Enter a prompt explaining what students should connect.')
    }
    if (cards.length > 0 && cards.length < 2) {
      errors.push('Add at least 2 cards to form connections.')
    }
    if (cards.length > 50) {
      errors.push('The board cannot have more than 50 cards.')
    }
    if (cards.length >= 2 && connections.length < 1) {
      errors.push('Create at least 1 connection for the answer key.')
    }
    if (connections.length > 80) {
      errors.push('The board cannot have more than 80 connections.')
    }

    cards.forEach((card, idx) => {
      const name = card.title?.trim() || `Card ${idx + 1}`
      if (card.content.length > 1000) {
        errors.push(`“${name}” exceeds 1,000 characters (${card.content.length}/1000).`)
      }
      if (card.type === 'image') {
        if (!card.url?.trim()) {
          errors.push(`“${name}” requires a Google Drive file link.`)
        } else {
          try {
            parseDriveUrl(card.url)
          } catch {
            errors.push(`“${name}” has an invalid Google Drive link.`)
          }
        }
      }
      if (card.type === 'link') {
        if (!card.url?.trim()) {
          errors.push(`“${name}” requires an HTTPS link.`)
        } else {
          try {
            const normalized = normalizeGenericUrl(card.url)
            if (!normalized.startsWith('https://')) {
              errors.push(`“${name}” link must start with https://.`)
            }
          } catch {
            errors.push(`“${name}” link URL is invalid.`)
          }
        }
      }
    })

    return errors
  }, [prompt, cards, connections])

  // Add Card
  const handleAddCard = useCallback(
    (type: CanvasCardType) => {
      if (cards.length >= 50) {
        showToast('error', 'Maximum limit of 50 cards reached.')
        return
      }
      const newId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const offset = (cards.length % 8) * 30
      const newCard: CanvasCard = {
        id: newId,
        type,
        title: type === 'note' ? 'Note' : type === 'paragraph' ? 'Section' : type === 'image' ? 'Image' : 'Link',
        content: type === 'note' ? 'Key concept' : type === 'paragraph' ? 'Enter detailed description...' : '',
        position: { x: 80 + offset, y: 60 + offset },
      }
      setCards((prev) => [...prev, newCard])
      setSelectedCardId(newId)
      setSelectedConnectionId(null)
      setShowSettingsPanel(false)
    },
    [cards.length, showToast],
  )

  // Delete Card
  const handleDeleteCard = useCallback((cardId: string) => {
    setCards((prev) => prev.filter((c) => c.id !== cardId))
    setConnections((prev) => prev.filter((c) => c.from !== cardId && c.to !== cardId))
    setSelectedCardId((curr) => (curr === cardId ? null : curr))
    setPositions((prev) => {
      const copy = { ...prev }
      delete copy[cardId]
      return copy
    })
  }, [])

  // Update Selected Card
  const handleUpdateSelectedCard = useCallback(
    (field: keyof CanvasCard, value: string) => {
      if (!selectedCardId) return
      setCards((prev) =>
        prev.map((c) => {
          if (c.id !== selectedCardId) return c
          const updated = { ...c, [field]: value }
          if (c.type === 'image' && field === 'url') {
            try {
              const parsed = parseDriveUrl(value)
              updated.driveFileId = parsed.fileId
              updated.driveKind = parsed.kind
            } catch {
              updated.driveFileId = undefined
              updated.driveKind = undefined
            }
          }
          return updated
        }),
      )
    },
    [selectedCardId],
  )

  // Add Connection via accessible dialog
  const handleAddAccessibleConnection = useCallback(() => {
    setConnectError(null)
    if (!connectFrom || !connectTo) {
      setConnectError('Please select both a source card and target card.')
      return
    }
    if (connectFrom === connectTo) {
      setConnectError('Cannot connect a card to itself.')
      return
    }
    const norm = normalizeConnection(connectFrom, connectTo, directed)
    const exists = connections.some(
      (c) => normalizeConnection(c.from, c.to, directed) === norm,
    )
    if (exists) {
      setConnectError('This connection already exists.')
      return
    }
    if (connections.length >= 80) {
      setConnectError('Maximum 80 connections reached.')
      return
    }

    const newConn: CanvasConnection = {
      id: norm,
      from: connectFrom,
      to: connectTo,
      points: Number(connectPoints) || 1,
    }

    setConnections((prev) => [...prev, newConn])
    setShowConnectModal(false)
    setConnectFrom('')
    setConnectTo('')
    setConnectPoints(1)
  }, [connectFrom, connectTo, directed, connections, connectPoints])

  // Toggle directed mode with confirmation if connections exist
  const handleToggleDirected = useCallback(
    (nextDirected: boolean) => {
      if (connections.length === 0) {
        setDirected(nextDirected)
        return
      }
      setPendingDirectedMode(nextDirected)
    },
    [connections.length],
  )

  const handleConfirmDirectedChange = useCallback(() => {
    if (pendingDirectedMode === null) return
    const nextDirected = pendingDirectedMode
    setDirected(nextDirected)
    const { connections: updatedConns, mergedCount } = renormalizeConnections(connections, nextDirected)
    setConnections(updatedConns)
    setPendingDirectedMode(null)

    if (!nextDirected && mergedCount > 0) {
      showToast(
        'info',
        `${mergedCount} reciprocal ${mergedCount === 1 ? 'connection was' : 'connections were'} merged into undirected ${mergedCount === 1 ? 'connection' : 'connections'}.`,
      )
    } else {
      showToast('success', nextDirected ? 'Switched to directed connections.' : 'Switched to undirected connections.')
    }
  }, [pendingDirectedMode, connections, showToast])

  // Save changes atomically via saveQuestionAndKey
  const handleSave = useCallback(async () => {
    if (validationErrors.length > 0) {
      showToast('error', validationErrors[0])
      return
    }
    setSaving(true)
    setSaveError(null)

    try {
      const cardsWithPositions = cards.map((c) => ({
        ...c,
        position: positions[c.id] ?? c.position,
      }))

      const questionPayload = {
        order: 0,
        type: 'canvas' as const,
        prompt: prompt.trim(),
        points: Number(points) || 100,
        layoutMode,
        directed,
        wrongPenalty,
        cards: cardsWithPositions,
      }

      const answerKeyPayload = {
        type: 'canvas' as const,
        explanation: explanation.trim(),
        connections,
      }

      // Domain validation check
      validateCanvasDefinition(questionPayload)
      validateCanvasKey(answerKeyPayload, cardsWithPositions, directed)

      await saveQuestionAndKey(quizId, 'board', questionPayload, answerKeyPayload)

      setSavedSignature(currentSignature)
      showToast('success', 'Canvas saved.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save canvas.'
      setSaveError(msg)
      showToast('error', msg)
    } finally {
      setSaving(false)
    }
  }, [
    validationErrors,
    cards,
    positions,
    prompt,
    points,
    layoutMode,
    directed,
    wrongPenalty,
    explanation,
    connections,
    quizId,
    currentSignature,
    showToast,
  ])

  // Leave navigation handler with guard
  const handleNavigateWithGuard = (targetUrl: string) => {
    if (isDirty) {
      setPendingLeaveTarget(targetUrl)
      setLeaveModalOpen(true)
    } else {
      navigate(targetUrl)
    }
  }

  const selectedCard = useMemo(
    () => cards.find((c) => c.id === selectedCardId) ?? null,
    [cards, selectedCardId],
  )

  const selectedConnection = useMemo(
    () => connections.find((c) => c.id === selectedConnectionId) ?? null,
    [connections, selectedConnectionId],
  )

  if (loading) {
    return (
      <AppShell>
        <PageHeader eyebrow="CANVAS BUILDER" title="Loading canvas…" subtitle="" />
        <main className="app-shell__content quiz-editor">
          <div className="quiz-editor-skeleton" aria-label="Loading canvas builder" />
        </main>
      </AppShell>
    )
  }

  if (loadError) {
    return (
      <AppShell>
        <PageHeader eyebrow="CANVAS BUILDER" title="Canvas unavailable" subtitle="We couldn’t load this canvas board." />
        <main className="app-shell__content quiz-editor">
          <Alert tone="error" label="Canvas not available">
            {loadError}
          </Alert>
          <Button to="/instructor/quizzes">Back to all quizzes</Button>
        </main>
      </AppShell>
    )
  }

  const connectCardsSlot = (
    <Button
      type="button"
      variant="secondary"
      onClick={() => {
        setConnectError(null)
        setShowConnectModal(true)
      }}
      disabled={cards.length < 2}
      aria-label="Connect cards dialog"
    >
      Connect cards
    </Button>
  )

  return (
    <AppShell>
      <PageHeader
        eyebrow="CANVAS BUILDER"
        title={quizTitle || 'Canvas board'}
        subtitle="Place cards and draw connections to define the student challenge and answer key."
        action={
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleNavigateWithGuard(`/instructor/quizzes/${quizId}?tab=settings`)}
          >
            <ArrowLeft size={17} aria-hidden="true" /> Settings
          </Button>
        }
      />
      <main className="app-shell__content canvas-builder-main" id="main-content">
        {/* Workspace navigation */}
        <nav aria-label="Quiz workspace" className="mb-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            aria-current="page"
            onClick={() => handleNavigateWithGuard(`/instructor/quizzes/${quizId}?tab=questions`)}
          >
            Questions
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleNavigateWithGuard(`/instructor/quizzes/${quizId}?tab=settings`)}
          >
            Settings
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleNavigateWithGuard(`/instructor/quizzes/${quizId}?tab=preview`)}
          >
            Preview
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleNavigateWithGuard(`/instructor/quizzes/${quizId}/results`)}
          >
            Results
          </Button>
        </nav>

        {/* Builder Toolbar & Status Header */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 p-3 bg-white rounded-2xl border border-navy-900-12 shadow-sm">
          <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Canvas authoring toolbar">
            <span className="text-sm font-semibold text-navy-800-72 mr-1">Add:</span>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleAddCard('note')}
              disabled={cards.length >= 50}
              aria-label="Add Note card"
            >
              <StickyNote size={15} aria-hidden="true" /> Note
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleAddCard('paragraph')}
              disabled={cards.length >= 50}
              aria-label="Add Paragraph card"
            >
              <FileText size={15} aria-hidden="true" /> Paragraph
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleAddCard('image')}
              disabled={cards.length >= 50}
              aria-label="Add Image card"
            >
              <ImageIcon size={15} aria-hidden="true" /> Image
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleAddCard('link')}
              disabled={cards.length >= 50}
              aria-label="Add Link card"
            >
              <LinkIcon size={15} aria-hidden="true" /> Link
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowSettingsPanel((prev) => !prev)
                setSelectedCardId(null)
                setSelectedConnectionId(null)
              }}
              aria-label="Board settings"
            >
              Board settings
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
                saving ? 'text-navy-700' : isDirty ? 'text-feedback-warning' : 'text-feedback-success'
              }`}
              role="status"
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  <span>Saving…</span>
                </>
              ) : isDirty ? (
                <>
                  <AlertCircle size={16} aria-hidden="true" />
                  <span>Unsaved changes</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <span>Saved</span>
                </>
              )}
            </span>
            {cards.length > 0 && validationErrors.length > 0 && (
              <span
                className="text-sm font-medium text-feedback-warning max-w-xs truncate"
                role="alert"
                title={validationErrors[0]}
              >
                {validationErrors[0]}
              </span>
            )}
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || cards.length === 0 || validationErrors.length > 0}
            >
              {saving ? 'Saving…' : 'Save board'}
            </Button>
          </div>
        </div>

        {/* Plain language validation notice if any (hidden when cards.length === 0) */}
        {cards.length > 0 && validationErrors.length > 0 && (
          <div className="mb-3">
            <Alert tone="warning" label="Review board requirements">
              <ul className="m-0 pl-5 list-disc text-sm space-y-1">
                {validationErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </Alert>
          </div>
        )}

        {saveError && (
          <div className="mb-3">
            <Alert tone="error" label="Save failed">
              {saveError}
            </Alert>
          </div>
        )}

        {/* Board or Empty State */}
        {cards.length === 0 ? (
          <EmptyState
            title="Start your canvas board"
            description="Add concept cards and draw connection lines between them to create the answer key."
            action={
              <Button type="button" onClick={() => handleAddCard('note')}>
                <Plus size={16} aria-hidden="true" /> Add your first card
              </Button>
            }
          />
        ) : (
          <div className="relative flex flex-col lg:flex-row gap-4 w-full lg:h-[650px]">
            {/* The Canvas Flow Board (responsive: min 420px below lg, full width) */}
            <div className="w-full lg:flex-1 h-[420px] sm:h-[480px] lg:h-full min-h-[420px] rounded-2xl border border-navy-900-12 overflow-hidden bg-navy-50 relative">
              <CanvasBoard
                cards={cards}
                connections={connections}
                mode="edit"
                directed={directed}
                maxConnections={80}
                positions={positions}
                onPositionsChange={(pos) => setPositions((prev) => ({ ...prev, ...pos }))}
                onCardsChange={setCards}
                onConnectionsChange={setConnections}
                onCardClick={(card) => {
                  setSelectedCardId(card.id)
                  setSelectedConnectionId(null)
                  setShowSettingsPanel(false)
                }}
                onConnectionClick={(conn) => {
                  setSelectedConnectionId(conn.id)
                  setSelectedCardId(null)
                  setShowSettingsPanel(false)
                }}
                connectCardsDialogSlot={connectCardsSlot}
              />
            </div>

            {/* Side/Bottom Panel for Card, Connection, or Board Settings (responsive: below board on mobile/tablet, side panel on desktop) */}
            {(selectedCard || selectedConnection || showSettingsPanel) && (
              <div
                className="w-full lg:w-80 lg:h-full max-h-[500px] lg:max-h-none bg-white rounded-2xl border border-navy-900-12 p-4 shadow-sm overflow-y-auto flex flex-col gap-4"
                aria-label="Editor side panel"
              >
                {/* Close Button with 44px touch target */}
                <div className="flex items-center justify-between border-b border-navy-900-12 pb-2">
                  <h3 className="text-sm font-semibold text-navy-900 m-0">
                    {selectedCard
                      ? `Edit ${selectedCard.type} card`
                      : selectedConnection
                      ? 'Edit connection'
                      : 'Board settings'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCardId(null)
                      setSelectedConnectionId(null)
                      setShowSettingsPanel(false)
                    }}
                    className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-full hover:bg-navy-900-12 text-navy-800 transition-colors"
                    aria-label="Close side panel"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>

                {/* Edit Selected Card */}
                {selectedCard && (
                  <div className="grid gap-3">
                    <Input
                      label="Title"
                      name="card-title"
                      value={selectedCard.title ?? ''}
                      onChange={(e) => handleUpdateSelectedCard('title', e.target.value)}
                    />
                    <Textarea
                      label="Content"
                      name="card-content"
                      value={selectedCard.content}
                      onChange={(e) => handleUpdateSelectedCard('content', e.target.value)}
                      maxLength={1000}
                      hint={`${selectedCard.content.length}/1000 characters`}
                      rows={4}
                    />

                    {selectedCard.type === 'image' && (
                      <Input
                        label="Google Drive link"
                        name="card-image-url"
                        value={selectedCard.url ?? ''}
                        onChange={(e) => handleUpdateSelectedCard('url', e.target.value)}
                        hint="Paste a Google Drive image or file link"
                      />
                    )}

                    {selectedCard.type === 'link' && (
                      <Input
                        label="HTTPS link URL"
                        name="card-link-url"
                        value={selectedCard.url ?? ''}
                        onChange={(e) => handleUpdateSelectedCard('url', e.target.value)}
                        hint="Must start with https://"
                      />
                    )}

                    <div className="pt-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="button--destructive w-full"
                        onClick={() => handleDeleteCard(selectedCard.id)}
                      >
                        <Trash2 size={15} aria-hidden="true" /> Delete card
                      </Button>
                    </div>
                  </div>
                )}

                {/* Edit Selected Connection */}
                {selectedConnection && (
                  <div className="grid gap-3">
                    <p className="text-sm text-navy-800-72">
                      Connects <strong>{cards.find((c) => c.id === selectedConnection.from)?.title || selectedConnection.from}</strong> to{' '}
                      <strong>{cards.find((c) => c.id === selectedConnection.to)?.title || selectedConnection.to}</strong>
                    </p>
                    <Input
                      label="Weight"
                      name="conn-weight"
                      type="number"
                      min={0}
                      value={String(selectedConnection.points ?? 1)}
                      onChange={(e) => {
                        const pts = Math.max(0, Number(e.target.value) || 0)
                        setConnections((prev) =>
                          prev.map((c) => (c.id === selectedConnection.id ? { ...c, points: pts } : c)),
                        )
                      }}
                      hint="Relative importance. The board’s points are split across connections by weight."
                    />
                    <div className="pt-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="button--destructive w-full"
                        onClick={() => {
                          setConnections((prev) => prev.filter((c) => c.id !== selectedConnection.id))
                          setSelectedConnectionId(null)
                        }}
                      >
                        <Trash2 size={15} aria-hidden="true" /> Delete connection
                      </Button>
                    </div>
                  </div>
                )}

                {/* Board Settings Panel */}
                {showSettingsPanel && !selectedCard && !selectedConnection && (
                  <div className="grid gap-3">
                    <Textarea
                      label="Activity prompt"
                      name="board-prompt"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      maxLength={2000}
                      rows={3}
                      required
                    />
                    <Input
                      label="Points for a perfect board"
                      name="board-points"
                      type="number"
                      min={1}
                      value={String(points)}
                      onChange={(e) => setPoints(Math.max(1, Number(e.target.value) || 1))}
                    />
                    <p className="text-sm font-medium text-navy-800" data-testid="live-weight-line">
                      {connections.length} {connections.length === 1 ? 'connection' : 'connections'}, total weight {totalWeight}
                    </p>
                    <Select
                      label="Card layout for students"
                      name="board-layout"
                      value={layoutMode}
                      onChange={(e) => setLayoutMode(e.target.value as CanvasLayoutMode)}
                      options={[
                        { value: 'scattered', label: 'Scattered (scrambled positions)' },
                        { value: 'fixed', label: 'Fixed (keep original layout)' },
                      ]}
                    />
                    <label className="choice-control">
                      <input
                        type="checkbox"
                        checked={directed}
                        onChange={(e) => handleToggleDirected(e.target.checked)}
                      />
                      <span className="choice-control__mark" aria-hidden="true" />
                      <span className="choice-control__copy">
                        <strong>Directed connections</strong>
                        <small>Arrows point from source to target</small>
                      </span>
                    </label>
                    <Select
                      label="Wrong connection penalty"
                      name="board-penalty"
                      value={wrongPenalty}
                      onChange={(e) => setWrongPenalty(e.target.value as CanvasWrongPenalty)}
                      options={[
                        { value: 'none', label: 'None (no penalty)' },
                        { value: 'half', label: 'Half (50% deduction)' },
                        { value: 'full', label: 'Full (100% deduction)' },
                      ]}
                    />
                    <Textarea
                      label="Answer key explanation (optional)"
                      name="board-explanation"
                      value={explanation}
                      onChange={(e) => setExplanation(e.target.value)}
                      rows={3}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Keyboard Accessible Connect Cards Modal */}
        <Dialog
          open={showConnectModal}
          onClose={() => setShowConnectModal(false)}
          title="Connect cards"
          description="Create an answer key connection by selecting source and target cards."
        >
          <div className="grid gap-4">
            {connectError && (
              <Alert tone="error" label="Could not create connection">
                {connectError}
              </Alert>
            )}
            <Select
              label="From card"
              name="connect-from"
              value={connectFrom}
              onChange={(e) => setConnectFrom(e.target.value)}
              options={[
                { value: '', label: 'Select source card' },
                ...cards.map((c) => ({
                  value: c.id,
                  label: c.title?.trim() || c.content.slice(0, 30) || c.id,
                })),
              ]}
            />
            <Select
              label="To card"
              name="connect-to"
              value={connectTo}
              onChange={(e) => setConnectTo(e.target.value)}
              options={[
                { value: '', label: 'Select target card' },
                ...cards.map((c) => ({
                  value: c.id,
                  label: c.title?.trim() || c.content.slice(0, 30) || c.id,
                })),
              ]}
            />
            <Input
              label="Weight"
              name="connect-weight-val"
              type="number"
              min={0}
              value={String(connectPoints)}
              onChange={(e) => setConnectPoints(Math.max(0, Number(e.target.value) || 0))}
              hint="Relative importance. The board’s points are split across connections by weight."
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

        {/* Leave without saving guard dialog */}
        <ConfirmDialog
          open={leaveModalOpen}
          onClose={() => {
            setLeaveModalOpen(false)
            setPendingLeaveTarget(null)
          }}
          onConfirm={() => {
            setLeaveModalOpen(false)
            if (pendingLeaveTarget) navigate(pendingLeaveTarget)
          }}
          title="Leave with unsaved changes?"
          description="Your edits have not been saved. Leaving this page will discard changes made to the canvas board."
          confirmLabel="Discard and leave"
        />

        {/* Directed mode change confirmation dialog */}
        <ConfirmDialog
          open={pendingDirectedMode !== null}
          onClose={() => setPendingDirectedMode(null)}
          onConfirm={handleConfirmDirectedChange}
          title={pendingDirectedMode ? 'Switch to directed connections?' : 'Switch to undirected connections?'}
          description={
            pendingDirectedMode
              ? 'Connections will point from source to target with arrowheads. Existing connection IDs will be updated. Arrow directions will follow card id order. Review them after switching back.'
              : 'Directional arrows will be removed. Any reciprocal connections (e.g. A→B and B→A) will be merged into a single connection keeping the higher point value.'
          }
          confirmLabel={pendingDirectedMode ? 'Switch to directed' : 'Switch to undirected'}
        />
      </main>
    </AppShell>
  )
}
