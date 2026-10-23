import { useEffect, useState } from 'react'
import { BookOpen, FileText, Network, Plus } from 'lucide-react'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { Dialog } from '../../../shared/ui/Dialog'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { Skeleton } from '../../../shared/ui/Skeleton'
import { useToast } from '../../../shared/ui/useToast'
import { useAuth } from '../../auth/useAuth'
import type { FlashcardDeckWithId } from '../../flashcards/types'
import { useFlashcardDecks } from '../../flashcards/useFlashcardDecks'
import { loadNoteContent } from '../../learningCanvas/noteService'
import { getContent, watchMyCanvasesAcrossClasses } from '../../learningCanvas/services'
import type { LearningCanvasWithId } from '../../learningCanvas/types'
import { getLessonPlan, listLessonPlans } from '../../lessons/services'
import type { LessonPlan } from '../../lessons/types'
import {
  buildSharedCanvasPayload,
  buildSharedDeckPayload,
  buildSharedLessonPlanPayload,
  buildSharedNotePayload,
} from '../schemas'
import { shareItemWithGroup } from '../services'
import type { SharedGroupItem, SharedItemKind } from '../types'

interface ShareItemDialogProps {
  groupId: string
  open: boolean
  initialKind?: SharedItemKind
  onClose: () => void
  onShared: () => void
}

export function ShareItemDialog({
  groupId,
  open,
  initialKind = 'deck',
  onClose,
  onShared,
}: ShareItemDialogProps) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const workspaceId = user?.uid ?? ''

  const [kind, setKind] = useState<SharedItemKind>(initialKind)

  // Decks
  const { decks, error: decksError } = useFlashcardDecks({
    role: 'student',
    uid: user?.uid,
    classIds: workspaceId ? [workspaceId] : [],
  })

  // Canvases & Notes
  const [allCanvases, setAllCanvases] = useState<LearningCanvasWithId[]>([])
  const [canvasesLoading, setCanvasesLoading] = useState(true)
  const [canvasesError, setCanvasesError] = useState<string | null>(null)

  // Lessons
  const [plans, setPlans] = useState<LessonPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [plansError, setPlansError] = useState<string | null>(null)

  // Selection state
  const [selectedItem, setSelectedItem] = useState<{
    id: string
    title: string
    summary?: string
    kind: SharedItemKind
    raw: any
  } | null>(null)

  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setKind(initialKind)
      setSelectedItem(null)
      setActionError(null)
    }
  }, [open, initialKind])

  // Watch canvases and notes
  useEffect(() => {
    if (!open || !user) return
    setCanvasesLoading(true)
    const unsub = watchMyCanvasesAcrossClasses(
      user.uid,
      (items) => {
        setAllCanvases(items)
        setCanvasesLoading(false)
      },
      (err) => {
        setCanvasesError(err.message || 'Could not load canvases')
        setCanvasesLoading(false)
      },
    )
    return () => unsub()
  }, [open, user])

  // Load lesson plans
  useEffect(() => {
    if (!open || !user) return
    setPlansLoading(true)
    listLessonPlans(user.uid)
      .then((res) => {
        setPlans(res)
        setPlansLoading(false)
      })
      .catch((err) => {
        setPlansError(err.message || 'Could not load lessons')
        setPlansLoading(false)
      })
  }, [open, user])

  const myDecks = decks.filter((d) => d.ownerId === user?.uid)
  const myCanvases = allCanvases.filter((c) => c.sourceCanvasId !== 'note')
  const myNotes = allCanvases.filter((c) => c.sourceCanvasId === 'note')

  const handleShare = async () => {
    if (!user || !selectedItem) return
    setBusy(true)
    setActionError(null)
    try {
      let payload: any = null

      if (selectedItem.kind === 'deck') {
        const d = selectedItem.raw as FlashcardDeckWithId
        payload = buildSharedDeckPayload(d.cards, d.classId)
      } else if (selectedItem.kind === 'canvas') {
        const c = selectedItem.raw as LearningCanvasWithId
        const content = await getContent(c.classId, c.id)
        payload = buildSharedCanvasPayload(content?.nodes || [], content?.edges || [], content?.viewport, c.classId)
      } else if (selectedItem.kind === 'lessonPlan') {
        const lp = selectedItem.raw as LessonPlan
        const full = await getLessonPlan(user.uid, lp.id)
        if (!full) throw new Error('Lesson plan could not be read')
        payload = buildSharedLessonPlanPayload(full.plan.topic, full.plan.level, full.plan.order, full.lessons)
      } else if (selectedItem.kind === 'note') {
        const n = selectedItem.raw as LearningCanvasWithId
        const text = await loadNoteContent(n.classId, n.id)
        payload = buildSharedNotePayload(text, n.classId)
      }

      const itemToShare: Omit<SharedGroupItem, 'sharedAt'> = {
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind: selectedItem.kind,
        title: selectedItem.title,
        summary: selectedItem.summary || '',
        payload,
        sharedByUid: user.uid,
        sharedByName: user.displayName || user.email || 'Learner',
        version: 1,
        originalItemId: selectedItem.id,
      }

      await shareItemWithGroup(groupId, itemToShare, {
        uid: user.uid,
        displayName: user.displayName || user.email,
      })

      showToast('success', `Shared "${selectedItem.title}" with group!`)
      onShared()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not share item.'
      setActionError(msg)
      showToast('error', msg)
    } finally {
      setBusy(false)
    }
  }

  const kindOptions: Array<{ kind: SharedItemKind; label: string; icon: any }> = [
    { kind: 'deck', label: 'Decks', icon: BookOpen },
    { kind: 'canvas', label: 'Canvases', icon: Network },
    { kind: 'lessonPlan', label: 'Lessons', icon: FileText },
    { kind: 'note', label: 'Notes', icon: FileText },
  ]

  const isLoading =
    ((kind === 'canvas' || kind === 'note') && canvasesLoading) ||
    (kind === 'lessonPlan' && plansLoading)

  const currentError =
    kind === 'deck'
      ? decksError
      : kind === 'canvas' || kind === 'note'
        ? canvasesError
        : plansError

  const currentItems =
    kind === 'deck'
      ? myDecks.map((d) => ({ id: d.id, title: d.title, summary: d.description, kind: 'deck' as const, raw: d, hint: `${d.cardCount} cards` }))
      : kind === 'canvas'
        ? myCanvases.map((c) => ({ id: c.id, title: c.title, summary: c.description, kind: 'canvas' as const, raw: c, hint: `${c.nodeCount} nodes, ${c.edgeCount} edges` }))
        : kind === 'lessonPlan'
          ? plans.map((p) => ({ id: p.id, title: p.title, summary: p.topic, kind: 'lessonPlan' as const, raw: p, hint: `${p.lessonCount} lessons · ${p.level}` }))
          : myNotes.map((n) => ({ id: n.id, title: n.title, summary: n.description, kind: 'note' as const, raw: n, hint: 'Study note' }))

  return (
    <Dialog
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Share learning material with the group"
      description="Choose a deck, canvas, lesson plan, or note to share as a read-only snapshot."
    >
      <div className="grid gap-5">
        {actionError && <Alert tone="error" label="Error">{actionError}</Alert>}
        {currentError && <Alert tone="error" label="Could not load items">{currentError}</Alert>}

        {/* Kind Picker Tabs (44px touch target) */}
        <div className="flex overflow-x-auto no-scrollbar sm:flex-wrap gap-2 border-b border-navy-900-15 pb-2 -mx-1 px-1" role="tablist" aria-label="Select material type">
          {kindOptions.map((opt) => {
            const Icon = opt.icon
            const active = kind === opt.kind
            return (
              <button
                key={opt.kind}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setKind(opt.kind)
                  setSelectedItem(null)
                }}
                className={`shrink-0 flex items-center gap-2 min-h-11 rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-navy-900 ${
                  active ? 'bg-navy-900 text-white shadow-xs' : 'bg-navy-900-08 text-navy-900 hover:bg-navy-900-15'
                }`}
              >
                <Icon size={16} aria-hidden="true" />
                {opt.label}
              </button>
            )
          })}
        </div>

        {/* List of items */}
        {isLoading ? (
          <div className="grid gap-2">
            <Skeleton className="h-14 rounded-2xl" />
            <Skeleton className="h-14 rounded-2xl" />
          </div>
        ) : currentItems.length === 0 ? (
          <EmptyState
            title={`No ${kindOptions.find((k) => k.kind === kind)?.label.toLowerCase()} available`}
            description={`Create or save ${kindOptions.find((k) => k.kind === kind)?.label.toLowerCase()} in your library first, then share them here.`}
          />
        ) : (
          <div className="max-h-72 sm:max-h-80 overflow-y-auto grid gap-2.5 pr-2 p-0.5" role="radiogroup" aria-label={`Choose ${kind} to share`}>
            {currentItems.map((item) => {
              const isSelected = selectedItem?.id === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSelectedItem(item)}
                  className={`group flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-left rounded-2xl border p-3.5 transition overflow-hidden focus:outline-none focus:ring-2 focus:ring-navy-900 ${
                    isSelected
                      ? 'border-navy-900 bg-navy-900-08 shadow-xs ring-1 ring-navy-900'
                      : 'border-navy-900-15 bg-white hover:border-navy-900-30 hover:bg-navy-900-02'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-bold text-navy-900 text-sm sm:text-base block truncate">
                      {item.title}
                    </span>
                    {item.summary && (
                      <span className="text-xs text-navy-900-72 mt-0.5 line-clamp-1 block">
                        {item.summary}
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 self-start sm:self-center inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-navy-900-08 text-navy-900 border border-navy-900-15 whitespace-nowrap">
                    {item.hint}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Selected Item Preview & Snapshot Notice */}
        {selectedItem && (
          <div className="rounded-2xl border border-navy-900-10 bg-navy-900-05 p-3.5 sm:p-4 grid gap-1.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-navy-900 truncate">Snapshot preview: {selectedItem.title}</span>
              <span className="text-xs text-navy-900-72 capitalize shrink-0">{selectedItem.kind}</span>
            </div>
            <p className="m-0 text-xs text-navy-900-72 leading-relaxed">
              Group members will receive a read-only snapshot copy. They cannot modify or see your personal private document.
            </p>
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t border-navy-900-10">
          <Button variant="secondary" onClick={onClose} disabled={busy} className="min-h-11 w-full sm:w-auto">
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void handleShare()} disabled={busy || !selectedItem} className="min-h-11 w-full sm:w-auto">
            <Plus size={16} aria-hidden="true" />
            {busy ? 'Sharing…' : 'Share snapshot with group'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
