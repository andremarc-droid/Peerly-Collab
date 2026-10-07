import { useState, useMemo } from 'react'
import {
  Plus,
  Search,
  X,
  Edit3,
  Trash2,
  Orbit,
  Calendar,
} from 'lucide-react'
import { Button } from '../../../shared/ui/Button'
import { Badge } from '../../../shared/ui/Badge'
import { Dialog } from '../../../shared/ui/Dialog'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { Input } from '../../../shared/ui/Input'
import { Textarea } from '../../../shared/ui/Textarea'
import type { LearningCanvasWithId } from '../types'

interface NotesTabContentProps {
  notes: LearningCanvasWithId[]
  classes: Array<{ id: string; name: string }>
  selectedClassId: string
  role: 'instructor' | 'student'
  onCreateNote: (input: { classId: string; title: string; content: string }) => Promise<string | undefined>
  onUpdateNote: (noteId: string, classId: string, content: string, title?: string) => Promise<void>
  onDeleteNote: (note: LearningCanvasWithId) => Promise<void>
  onViewInGraph: (noteId: string) => void
}

export function NotesTabContent({
  notes,
  classes,
  selectedClassId,
  role: _role,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  onViewInGraph,
}: NotesTabContentProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newClassId, setNewClassId] = useState('')
  const [creatingBusy, setCreatingBusy] = useState(false)

  // Edit note dialog state
  const [editingNote, setEditingNote] = useState<LearningCanvasWithId | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editingBusy, setEditingBusy] = useState(false)

  // Delete confirm dialog state
  const [deleteTarget, setDeleteTarget] = useState<LearningCanvasWithId | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const activeTargetClassId =
    selectedClassId !== 'all' ? selectedClassId : classes[0]?.id || ''

  // Filter notes by search
  const filteredNotes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return notes
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(query) ||
        (n.description && n.description.toLowerCase().includes(query)),
    )
  }, [notes, searchQuery])

  const classMap = useMemo(() => {
    return new Map(classes.map((c) => [c.id, c.name]))
  }, [classes])

  const handleOpenCreate = () => {
    setNewTitle('')
    setNewContent('')
    setNewClassId(activeTargetClassId)
    setCreateDialogOpen(true)
  }

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    const targetClass = newClassId || activeTargetClassId
    if (!targetClass) return

    setCreatingBusy(true)
    try {
      await onCreateNote({
        classId: targetClass,
        title: newTitle.trim(),
        content: newContent.trim(),
      })
      setCreateDialogOpen(false)
    } finally {
      setCreatingBusy(false)
    }
  }

  const handleOpenEdit = (note: LearningCanvasWithId) => {
    setEditingNote(note)
    setEditTitle(note.title)
    setEditContent(note.description || '')
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingNote || !editTitle.trim()) return

    setEditingBusy(true)
    try {
      await onUpdateNote(editingNote.id, editingNote.classId, editContent, editTitle.trim())
      setEditingNote(null)
    } finally {
      setEditingBusy(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setDeleteBusy(true)
    try {
      await onDeleteNote(deleteTarget)
      setDeleteTarget(null)
    } finally {
      setDeleteBusy(false)
    }
  }

  const formatDate = (timestamp?: { seconds: number }) => {
    if (!timestamp?.seconds) return ''
    const d = new Date(timestamp.seconds * 1000)
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div className="grid gap-6">
      {/* Search & Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white rounded-3xl border border-navy-900-12 shadow-xs">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-800-72 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes by title or content…"
            className="w-full py-2 pl-9 pr-8 text-xs font-medium text-navy-900 bg-navy-900-05 border border-navy-900-15 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-800"
            aria-label="Search notes"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-navy-800-72 hover:text-navy-900"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="primary"
            onClick={handleOpenCreate}
            disabled={classes.length === 0}
            className="gap-1.5"
          >
            <Plus size={16} aria-hidden="true" />
            <span>New note</span>
          </Button>
        </div>
      </div>

      {/* Notes Grid or Empty State */}
      {filteredNotes.length === 0 ? (
        <EmptyState
          title={searchQuery ? 'No matching notes found' : 'No notes yet'}
          description={
            searchQuery
              ? 'Try adjusting your search terms or clearing the filter.'
              : 'Create concept notes to capture insights, summaries, and lecture takeaways. You can visually connect notes directly in the Graph View.'
          }
          action={
            !searchQuery && classes.length > 0 ? (
              <Button type="button" variant="primary" onClick={handleOpenCreate}>
                <Plus size={16} aria-hidden="true" />
                <span>Create first note</span>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNotes.map((note) => {
            const className = classMap.get(note.classId) || 'Class'
            const dateStr = formatDate(note.updatedAt)

            return (
              <article
                key={note.id}
                className="flex flex-col justify-between p-5 bg-white rounded-3xl border border-navy-900-12 shadow-xs hover:shadow-md transition-shadow group"
                aria-label={`Note: ${note.title}`}
              >
                <div>
                  {/* Top metadata row */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <Badge variant="neutral" className="text-[11px] truncate max-w-[180px]">
                      {className}
                    </Badge>
                    {dateStr && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-navy-800-72">
                        <Calendar size={12} aria-hidden="true" />
                        <span>{dateStr}</span>
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h3 className="text-base font-bold text-navy-900 mb-2 line-clamp-1">
                    {note.title}
                  </h3>

                  {/* Content Preview */}
                  <div className="p-3 bg-navy-900-05 rounded-2xl border border-navy-900-08 mb-4 min-h-[80px]">
                    <p className="text-xs text-navy-900-88 line-clamp-4 leading-relaxed font-normal whitespace-pre-wrap m-0">
                      {note.description || (
                        <span className="italic text-navy-800-72">No note content written yet.</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-between pt-3 border-t border-navy-900-08 gap-2">
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => handleOpenEdit(note)}
                      className="py-1 px-2.5 text-xs min-h-8 gap-1"
                      title="Edit note text"
                    >
                      <Edit3 size={13} aria-hidden="true" />
                      <span>Edit</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => onViewInGraph(note.id)}
                      className="py-1 px-2.5 text-xs min-h-8 gap-1 text-navy-800"
                      title="Open and connect this note in Knowledge Graph"
                    >
                      <Orbit size={13} aria-hidden="true" />
                      <span>In Graph</span>
                    </Button>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setDeleteTarget(note)}
                    className="py-1 px-2 text-xs min-h-8 text-navy-800 hover:text-navy-900"
                    title="Delete note"
                    aria-label={`Delete note "${note.title}"`}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {/* Create Note Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        title="Create Concept Note"
      >
        <form onSubmit={handleCreateSubmit} className="grid gap-4">
          <p className="text-xs text-navy-800-72 m-0">
            Concept notes are lightweight knowledge cards that you can connect with canvases,
            modules, and quizzes in your Knowledge Graph.
          </p>

          {classes.length > 1 && (
            <div className="grid gap-1.5">
              <label htmlFor="create-note-class" className="text-xs font-bold text-navy-900">
                Class
              </label>
              <select
                id="create-note-class"
                value={newClassId}
                onChange={(e) => setNewClassId(e.target.value)}
                className="w-full py-2 px-3 text-xs font-semibold text-navy-900 bg-navy-900-05 border border-navy-900-15 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-800"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid gap-1.5">
            <label htmlFor="create-note-title" className="text-xs font-bold text-navy-900">
              Note Title
            </label>
            <Input
              id="create-note-title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Newton's Third Law, Krebs Cycle Key Takeaways…"
              required
            />
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="create-note-content" className="text-xs font-bold text-navy-900">
              Content / Details
            </label>
            <Textarea
              id="create-note-content"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Write your study notes, definitions, or bullet points here…"
              rows={5}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-navy-900-12">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCreateDialogOpen(false)}
              disabled={creatingBusy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={creatingBusy || !newTitle.trim()}
            >
              {creatingBusy ? 'Creating…' : 'Create note'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Edit Note Dialog */}
      <Dialog
        open={Boolean(editingNote)}
        onClose={() => setEditingNote(null)}
        title="Edit Concept Note"
      >
        <form onSubmit={handleEditSubmit} className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor="edit-note-title" className="text-xs font-bold text-navy-900">
              Note Title
            </label>
            <Input
              id="edit-note-title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="edit-note-content" className="text-xs font-bold text-navy-900">
              Content / Details
            </label>
            <Textarea
              id="edit-note-content"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Write your study notes here…"
              rows={8}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-navy-900-12">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditingNote(null)}
              disabled={editingBusy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={editingBusy || !editTitle.trim()}
            >
              {editingBusy ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Note Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        busy={deleteBusy}
        title="Delete Note"
        message={`Are you sure you want to delete note "${deleteTarget?.title}"? This will also remove it from the knowledge graph.`}
        confirmLabel="Delete Note"
        isDestructive
      />
    </div>
  )
}
