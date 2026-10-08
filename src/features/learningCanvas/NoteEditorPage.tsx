import { useEffect, useState, type KeyboardEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { AppShell } from '../../app/AppShell'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import { useAuth } from '../auth/useAuth'
import { logActivity } from './collab/activityService'
import { NOTE_CONTENT_MAX, NOTE_TITLE_MAX } from './noteContent'
import { loadNoteContent, saveNote } from './noteService'
import { getCanvas } from './services'
import './noteEditor.css'

type Role = 'instructor' | 'student'
type LoadState = 'loading' | 'ready' | 'missing' | 'forbidden' | 'error'

/** Full-screen editor for one note. Title and content are saved together so every view stays in sync. */
export function NoteEditorPage({ role }: { role: Role }) {
  const { classId, noteId } = useParams<{ classId: string; noteId: string }>()
  // Keyed so opening a different note always starts from a clean editor.
  return <NoteEditor key={`${classId}/${noteId}`} role={role} classId={classId ?? ''} noteId={noteId ?? ''} />
}

function NoteEditor({ role, classId, noteId }: { role: Role; classId: string; noteId: string }) {
  const { user } = useAuth()
  const uid = user?.uid
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [state, setState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [baseline, setBaseline] = useState({ title: '', content: '' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const backPath = `/${role}/learning?tab=notes`
  const dirty = title !== baseline.title || content !== baseline.content
  const canSave = state === 'ready' && dirty && !saving && title.trim().length > 0

  useEffect(() => {
    if (!uid || !classId || !noteId) return undefined
    let cancelled = false
    Promise.all([getCanvas(classId, noteId), loadNoteContent(classId, noteId)])
      .then(([meta, text]) => {
        if (cancelled) return
        if (!meta || meta.sourceCanvasId !== 'note') {
          setState('missing')
          return
        }
        if (meta.ownerId !== uid) {
          setState('forbidden')
          return
        }
        setTitle(meta.title)
        setContent(text)
        setBaseline({ title: meta.title, content: text })
        setState('ready')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setLoadError(error instanceof Error ? error.message : 'This note could not be loaded.')
        setState('error')
      })
    return () => {
      cancelled = true
    }
  }, [uid, classId, noteId])

  // Warn before the tab is closed or reloaded with unsaved work.
  useEffect(() => {
    if (!dirty) return undefined
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const goBack = () => {
    if (dirty && !window.confirm('You have unsaved changes. Leave without saving?')) return
    navigate(backPath)
  }

  const save = async () => {
    if (!canSave || !user) return
    setSaving(true)
    setSaveError(null)
    try {
      const cleanTitle = title.trim()
      const { titleChanged } = await saveNote(classId, noteId, { title: cleanTitle, content })
      setTitle(cleanTitle)
      setBaseline({ title: cleanTitle, content: content.slice(0, NOTE_CONTENT_MAX) })
      showToast('success', 'Note saved.')
      try {
        await logActivity(classId, noteId, {
          uid: user.uid,
          name: user.displayName || user.email || 'Learner',
        }, {
          type: 'edit',
          summary: `Updated note \u201c${cleanTitle}\u201d`,
          changes: titleChanged ? [`Title: ${cleanTitle}`, 'Updated note content'] : ['Updated note content'],
        })
      } catch {
        showToast('error', 'The note was saved, but its activity could not be recorded.')
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The note could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      void save()
    }
  }

  const status = saving ? 'Saving\u2026' : dirty ? 'Unsaved changes' : 'All changes saved'

  return (
    <AppShell>
      <main className="note-editor" id="main-content" onKeyDown={handleKeyDown}>
        {state === 'loading' && (
          <div className="note-editor__inner" aria-busy="true">
            <Skeleton className="h-10 rounded-2xl" label="Loading note" />
            <Skeleton className="h-[50svh] rounded-3xl" />
          </div>
        )}

        {(state === 'missing' || state === 'forbidden' || state === 'error') && (
          <div className="note-editor__inner">
            <Alert
              tone="error"
              label={state === 'forbidden' ? 'You cannot edit this note here' : 'Note unavailable'}
              action={<Button type="button" variant="secondary" onClick={() => navigate(backPath)}>Back to notes</Button>}
            >
              {state === 'missing' && 'This note could not be found. It may have been deleted.'}
              {state === 'forbidden' && 'Only the person who created this note can edit it from here. Shared notes open in the whiteboard.'}
              {state === 'error' && (loadError ?? 'This note could not be loaded.')}
            </Alert>
          </div>
        )}

        {state === 'ready' && (
          <>
            <div className="note-editor__inner note-editor__inner--grow">
              <div className="note-editor__top">
                <Button type="button" variant="ghost" onClick={goBack} className="note-editor__back">
                  <ArrowLeft size={16} aria-hidden="true" />
                  <span>Notes</span>
                </Button>
                <span className="note-editor__status" role="status" data-dirty={dirty ? 'true' : 'false'}>{status}</span>
              </div>

              {saveError && <Alert tone="error" label="Could not save this note">{saveError}</Alert>}

              <label className="sr-only" htmlFor="note-editor-title">Note title</label>
              <input
                id="note-editor-title"
                className="note-editor__title"
                value={title}
                maxLength={NOTE_TITLE_MAX}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Untitled note"
                autoComplete="off"
              />

              <label className="sr-only" htmlFor="note-editor-content">Note content</label>
              <textarea
                id="note-editor-content"
                className="note-editor__body"
                value={content}
                maxLength={NOTE_CONTENT_MAX}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Write your study notes, definitions, or bullet points here\u2026"
              />
            </div>

            <footer className="note-editor__footer">
              <div className="note-editor__footer-inner">
                <span className="note-editor__count">{content.length}/{NOTE_CONTENT_MAX} characters</span>
                <div className="note-editor__actions">
                  <Button type="button" variant="secondary" onClick={goBack} disabled={saving}>
                    {dirty ? 'Cancel' : 'Close'}
                  </Button>
                  <Button type="button" variant="primary" onClick={() => void save()} disabled={!canSave}>
                    <Save size={16} aria-hidden="true" />
                    <span>{saving ? 'Saving\u2026' : 'Save changes'}</span>
                  </Button>
                </div>
              </div>
            </footer>
          </>
        )}
      </main>
    </AppShell>
  )
}
