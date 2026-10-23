import { useState } from 'react'
import { BookOpen, Download, Eye, FileText, Network, Play, Plus, RefreshCw, Trash2 } from 'lucide-react'
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
    <section className="rounded-3xl border border-navy-900-15 bg-white p-4 sm:p-6 shadow-sm grid gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="m-0 text-xl font-bold text-navy-900">{meta.title}</h3>
        <Button variant="primary" onClick={onOpenShare} className="min-h-11 w-full sm:w-auto justify-center">
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
          <Button variant="secondary" onClick={onRetry} className="min-h-11">
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
            <Button variant="primary" onClick={onOpenShare} className="min-h-11">
              <Plus size={16} aria-hidden="true" />
              Share first {meta.single}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2">
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
                className="flex flex-col justify-between rounded-2xl border border-navy-900-15 bg-white sm:bg-navy-900-02 p-4 shadow-2xs hover:border-navy-900-30 transition"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs text-navy-900-72 truncate">Shared by {item.sharedByName}</span>
                    <span className="shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-navy-900-08 text-navy-900 border border-navy-900-12">
                      {badgeText}
                    </span>
                  </div>
                  <h4 className="m-0 font-bold text-navy-900 text-base sm:text-lg break-words">{item.title}</h4>
                  {item.summary && (
                    <p className="mt-1 text-sm text-navy-900-72 line-clamp-2">{item.summary}</p>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 border-t border-navy-900-10 pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="primary" onClick={() => onViewItem(item)} className="min-h-11 sm:min-h-10 text-xs px-3.5">
                      {item.kind === 'deck' ? <Play size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                      {item.kind === 'deck' ? 'Study' : 'View'}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => void handleCopy(item)}
                      disabled={copyingId === item.id}
                      aria-label={`Save a copy of ${item.title}`}
                      className="min-h-11 sm:min-h-10 text-xs px-3.5"
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
                        className="text-xs font-medium text-navy-900-72 hover:text-navy-900 underline min-h-11 px-2.5 inline-flex items-center"
                      >
                        {updatingId === item.id ? 'Updating…' : 'Update copy'}
                      </button>
                    )}
                    {canRemove && (
                      <Button
                        variant="ghost"
                        onClick={() => onRemoveItem(item)}
                        aria-label={`Remove ${item.title} from group`}
                        className="min-h-11 px-2.5 text-navy-900-72 hover:text-red-600"
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
