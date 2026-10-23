import { useState } from 'react'
import { BookOpen, Download, Eye, FileText, Network, Play, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { Skeleton } from '../../../shared/ui/Skeleton'
import type {
  SharedCanvasPayload,
  SharedDeckPayload,
  SharedGroupItem,
  SharedItemKind,
  SharedLessonPlanPayload,
} from '../types'

interface SharedItemsTabContentProps {
  kind: SharedItemKind
  items: SharedGroupItem[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onOpenShare: () => void
  onViewItem: (item: SharedGroupItem) => void
  onSaveCopy: (item: SharedGroupItem) => Promise<void>
  onUpdateItem: (item: SharedGroupItem) => Promise<void>
  onRemoveItem: (item: SharedGroupItem) => void
  isOwner: boolean
  currentUid?: string
}

export function SharedItemsTabContent({
  kind,
  items,
  loading,
  error,
  onRetry,
  onOpenShare,
  onViewItem,
  onSaveCopy,
  onUpdateItem,
  onRemoveItem,
  isOwner,
  currentUid,
}: SharedItemsTabContentProps) {
  const [copyingId, setCopyingId] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const meta = {
    deck: { title: 'Shared flashcard decks', single: 'deck', icon: BookOpen },
    canvas: { title: 'Shared learning canvases', single: 'canvas', icon: Network },
    lessonPlan: { title: 'Shared lesson plans', single: 'lesson plan', icon: FileText },
    note: { title: 'Shared study notes', single: 'note', icon: FileText },
  }[kind]

  const handleCopy = async (item: SharedGroupItem) => {
    setCopyingId(item.id)
    try {
      await onSaveCopy(item)
    } finally {
      setCopyingId(null)
    }
  }

  const handleUpdate = async (item: SharedGroupItem) => {
    setUpdatingId(item.id)
    try {
      await onUpdateItem(item)
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <section className="rounded-3xl border border-navy-900-15 bg-white p-5 shadow-sm grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="m-0 text-xl font-bold text-navy-900">{meta.title}</h3>
        <Button variant="primary" onClick={onOpenShare}>
          <Plus size={16} aria-hidden="true" />
          Share {meta.single}
        </Button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-navy-900-15 bg-navy-900-05 p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="m-0 text-sm font-semibold text-navy-900">{meta.title} couldn't load</p>
            <p className="m-0 text-xs text-navy-900-72">{error}</p>
          </div>
          <Button variant="secondary" onClick={onRetry}>
            <RefreshCw size={14} aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={`No shared ${meta.single}s yet`}
          description={`Share ${meta.single}s from your library so group members can study and collaborate.`}
          action={
            <Button variant="primary" onClick={onOpenShare}>
              <Plus size={16} aria-hidden="true" />
              Share first {meta.single}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => {
            const isSharer = item.sharedByUid === currentUid
            const canRemove = isOwner || isSharer

            let badgeText = ''
            if (item.kind === 'deck') {
              badgeText = `${(item.payload as SharedDeckPayload).cardCount} cards`
            } else if (item.kind === 'canvas') {
              badgeText = `${(item.payload as SharedCanvasPayload).nodeCount} nodes`
            } else if (item.kind === 'lessonPlan') {
              badgeText = `${(item.payload as SharedLessonPlanPayload).lessonCount} lessons`
            } else if (item.kind === 'note') {
              badgeText = 'Study note'
            }

            return (
              <article
                key={item.id}
                className="flex flex-col justify-between rounded-2xl border border-navy-900-15 bg-navy-900-05 p-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs text-navy-900-72">Shared by {item.sharedByName}</span>
                    <Badge>{badgeText}</Badge>
                  </div>
                  <h4 className="m-0 font-bold text-navy-900 text-base">{item.title}</h4>
                  {item.summary && (
                    <p className="mt-1 text-sm text-navy-900-72 line-clamp-2">{item.summary}</p>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-navy-900-10 pt-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button variant="primary" onClick={() => onViewItem(item)}>
                      {item.kind === 'deck' ? <Play size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                      {item.kind === 'deck' ? 'Study' : 'View'}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => void handleCopy(item)}
                      disabled={copyingId === item.id}
                      aria-label={`Save a copy of ${item.title}`}
                    >
                      <Download size={14} aria-hidden="true" />
                      {copyingId === item.id ? 'Saving…' : 'Save copy'}
                    </Button>
                  </div>

                  <div className="flex items-center gap-1">
                    {isSharer && (
                      <button
                        type="button"
                        onClick={() => void handleUpdate(item)}
                        disabled={updatingId === item.id}
                        className="text-xs text-navy-900-72 hover:text-navy-900 underline min-h-8 px-2"
                      >
                        {updatingId === item.id ? 'Updating…' : 'Update copy'}
                      </button>
                    )}
                    {canRemove && (
                      <Button
                        variant="ghost"
                        onClick={() => onRemoveItem(item)}
                        aria-label={`Remove ${item.title} from group`}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
