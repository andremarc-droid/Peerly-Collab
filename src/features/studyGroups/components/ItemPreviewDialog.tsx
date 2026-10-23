import { useState } from 'react'
import { BookOpen, Download, FileText, Network, Play } from 'lucide-react'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { Dialog } from '../../../shared/ui/Dialog'
import type {
  SharedCanvasPayload,
  SharedDeckPayload,
  SharedGroupItem,
  SharedLessonPlanPayload,
  SharedNotePayload,
} from '../types'

interface ItemPreviewDialogProps {
  item: SharedGroupItem | null
  open: boolean
  onClose: () => void
  onSaveCopy: (item: SharedGroupItem) => Promise<void>
  onStudyDeck?: (item: SharedGroupItem) => void
}

export function ItemPreviewDialog({
  item,
  open,
  onClose,
  onSaveCopy,
  onStudyDeck,
}: ItemPreviewDialogProps) {
  const [saving, setSaving] = useState(false)

  if (!item) return null

  const handleCopy = async () => {
    setSaving(true)
    try {
      await onSaveCopy(item)
    } finally {
      setSaving(false)
    }
  }

  const kindIcons = {
    deck: <BookOpen size={16} aria-hidden="true" />,
    canvas: <Network size={16} aria-hidden="true" />,
    lessonPlan: <FileText size={16} aria-hidden="true" />,
    note: <FileText size={16} aria-hidden="true" />,
  }

  const kindLabels = {
    deck: 'Flashcard Deck',
    canvas: 'Learning Canvas',
    lessonPlan: 'Lesson Plan',
    note: 'Study Note',
  }

  return (
    <Dialog
      open={open}
      onClose={saving ? () => undefined : onClose}
      title={item.title}
      description={`Shared by ${item.sharedByName}`}
    >
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-900-10 pb-3">
          <div className="flex items-center gap-2">
            <Badge>
              {kindIcons[item.kind]}
              <span className="ml-1.5">{kindLabels[item.kind]}</span>
            </Badge>
            <span className="text-xs text-navy-900-72">Snapshot v{item.version}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {item.kind === 'deck' && onStudyDeck && (
              <Button
                variant="primary"
                onClick={() => {
                  onClose()
                  onStudyDeck(item)
                }}
              >
                <Play size={16} aria-hidden="true" />
                Study
              </Button>
            )}
            <Button variant="secondary" onClick={() => void handleCopy()} disabled={saving}>
              <Download size={16} aria-hidden="true" />
              {saving ? 'Saving…' : 'Save a copy to my library'}
            </Button>
          </div>
        </div>

        {item.summary && (
          <div className="text-sm text-navy-900-72 bg-navy-900-05 p-3 rounded-2xl">
            {item.summary}
          </div>
        )}

        {/* Kind-specific Preview */}
        {item.kind === 'deck' && (
          <div className="grid gap-3">
            <h4 className="m-0 text-sm font-bold text-navy-900">
              Cards ({(item.payload as SharedDeckPayload).cardCount})
            </h4>
            <div className="max-h-80 overflow-y-auto grid gap-2 pr-1">
              {(item.payload as SharedDeckPayload).cards.map((c, i) => (
                <div key={c.id || i} className="rounded-xl border border-navy-900-15 bg-white p-3 text-sm">
                  <div className="font-semibold text-navy-900 mb-1">
                    <span className="text-navy-900-72 mr-1">#{i + 1}</span> {c.front}
                  </div>
                  <div className="text-navy-900-72 border-t border-navy-900-05 pt-1 text-xs">
                    {c.back}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {item.kind === 'canvas' && (
          <div className="grid gap-3">
            <div className="flex items-center gap-2 text-sm text-navy-900">
              <span>
                <strong>{(item.payload as SharedCanvasPayload).nodeCount}</strong> nodes
              </span>
              <span>·</span>
              <span>
                <strong>{(item.payload as SharedCanvasPayload).edgeCount}</strong> connections
              </span>
            </div>

            <div className="max-h-80 overflow-y-auto grid gap-2 pr-1">
              {(item.payload as SharedCanvasPayload).nodes.map((node: any, i: number) => (
                <div key={node.id || i} className="rounded-xl border border-navy-900-15 bg-white p-3 text-sm">
                  <div className="flex items-center justify-between text-xs text-navy-900-72 mb-1">
                    <span className="capitalize font-semibold">{node.type} node</span>
                  </div>
                  {node.text && <p className="m-0 text-navy-900 whitespace-pre-wrap">{node.text}</p>}
                  {node.link && (
                    <p className="m-0 text-navy-900">
                      <strong>{node.link.title || 'Link'}:</strong> {node.link.url}
                    </p>
                  )}
                  {node.group && <p className="m-0 font-bold text-navy-900">{node.group.label}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {item.kind === 'lessonPlan' && (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge>{(item.payload as SharedLessonPlanPayload).level}</Badge>
              <span className="text-navy-900-72">
                Topic: <strong>{(item.payload as SharedLessonPlanPayload).topic}</strong>
              </span>
              <span className="text-navy-900-72">
                · {(item.payload as SharedLessonPlanPayload).lessonCount} lessons
              </span>
            </div>

            <div className="max-h-80 overflow-y-auto grid gap-3 pr-1">
              {(item.payload as SharedLessonPlanPayload).order.map((lessonId, idx) => {
                const lesson = (item.payload as SharedLessonPlanPayload).lessons[lessonId]
                if (!lesson) return null
                return (
                  <div key={lessonId} className="rounded-2xl border border-navy-900-15 bg-white p-4 text-sm grid gap-2">
                    <div className="flex items-center justify-between">
                      <h5 className="m-0 text-base font-bold text-navy-900">
                        {idx + 1}. {lesson.title}
                      </h5>
                    </div>
                    {lesson.objective && (
                      <p className="m-0 text-xs italic text-navy-900-72">
                        Objective: {lesson.objective}
                      </p>
                    )}
                    <p className="m-0 text-navy-900 text-sm whitespace-pre-wrap line-clamp-4">
                      {lesson.content}
                    </p>
                    {lesson.keyPoints && lesson.keyPoints.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {lesson.keyPoints.map((kp, k) => (
                          <span
                            key={k}
                            className="inline-block bg-navy-900-05 text-navy-900 text-xs px-2 py-0.5 rounded-full"
                          >
                            {kp}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {item.kind === 'note' && (
          <div className="grid gap-3">
            <div className="max-h-96 overflow-y-auto rounded-2xl border border-navy-900-15 bg-white p-4">
              <p className="m-0 text-sm text-navy-900 whitespace-pre-wrap leading-relaxed">
                {(item.payload as SharedNotePayload).text}
              </p>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
