import { ArrowLeft, ClipboardList, Send } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../../app/AppShell'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { Input } from '../../shared/ui/Input'
import { PageHeader } from '../../shared/ui/PageHeader'
import { SectionCard } from '../../shared/ui/SectionCard'
import { Skeleton } from '../../shared/ui/Skeleton'
import { Textarea } from '../../shared/ui/Textarea'
import { useToast } from '../../shared/ui/useToast'
import { watchClass } from '../classes/services/classService'
import type { ClassWithId } from '../classes/types'
import { AttachmentsSection } from './AttachmentsSection'
import { DueDateTimeField } from './DueDateTimeField'
import { fromLocalInputValue, parsePoints, toLocalInputValue } from './format'
import { getPublishIssue } from './schemas'
import { publishAssignment, subscribeToAssignment, unpublishAssignment, updateAssignment } from './services'
import { TurnInSettings } from './TurnInSettings'
import { TurnInsPanel } from './TurnInsPanel'
import { MAX_INSTRUCTIONS_LENGTH, MAX_POINTS, MAX_TITLE_LENGTH, type AssignmentPatch, type AssignmentWithId } from './types'
import { useGoogleDrive } from './useGoogleDrive'
import '../modules/modules.css'
import './assignments.css'

type SaveState = 'saved' | 'saving' | 'error'

export function AssignmentEditorPage() {
  const { classId = '', assignmentId = '' } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const drive = useGoogleDrive()
  const [classroom, setClassroom] = useState<ClassWithId | null>(null)
  const [assignment, setAssignment] = useState<AssignmentWithId | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [retry, setRetry] = useState(0)
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [due, setDue] = useState('')
  const [points, setPoints] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [saveRetry, setSaveRetry] = useState(0)
  const dirtyRef = useRef(false)
  const parsedPoints = parsePoints(points)
  const pointsError = parsedPoints === undefined ? `Enter a whole number from 0 to ${MAX_POINTS}, or leave it blank.` : undefined
  const backTo = `/instructor/classes/${classId}?tab=assignments`

  useEffect(() => {
    if (!classId) return undefined
    return watchClass(classId, setClassroom, (reason) => setLoadError(reason.message))
  }, [classId, retry])

  useEffect(() => {
    if (!classId || !assignmentId) return undefined
    return subscribeToAssignment(classId, assignmentId, (found) => {
      setAssignment(found); setLoading(false)
      setLoadError(found ? '' : 'This assignment could not be found or you do not have access.')
      if (found && !dirtyRef.current) {
        setTitle(found.title); setInstructions(found.instructions)
        setDue(toLocalInputValue(found.dueAt)); setPoints(found.points === null ? '' : String(found.points))
      }
    }, (reason) => { setLoadError(reason.message); setLoading(false) })
  }, [classId, assignmentId, retry])

  useEffect(() => {
    if (!assignment?.id || !dirtyRef.current) return undefined
    if (!title.trim() || parsedPoints === undefined) { setSaveState('error'); return undefined }
    setSaveState('saving')
    const timer = window.setTimeout(() => {
      void updateAssignment(classId, assignmentId, { title, instructions, dueAt: fromLocalInputValue(due), points: parsedPoints })
        .then(() => { dirtyRef.current = false; setSaveState('saved') })
        .catch(() => setSaveState('error'))
    }, saveRetry ? 0 : 650)
    return () => window.clearTimeout(timer)
  }, [title, instructions, due, parsedPoints, assignment?.id, classId, assignmentId, saveRetry])

  function edit(setter: (value: string) => void, value: string) { dirtyRef.current = true; setter(value) }
  const patch = useCallback((value: AssignmentPatch) => updateAssignment(classId, assignmentId, value), [classId, assignmentId])

  async function togglePublished() {
    if (!assignment) return
    try {
      if (assignment.status === 'published') { await unpublishAssignment(classId, assignmentId); showToast('success', 'Assignment unpublished.') }
      else {
        await publishAssignment(classId, assignmentId)
        showToast('success', 'Assignment published.')
        navigate(backTo, { replace: true })
      }
    } catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'The assignment could not be updated.') }
  }

  if (loading) return <AppShell><PageHeader eyebrow="ASSIGNMENT" title="Loading assignment…" subtitle="" /><main className="app-shell__content grid gap-4"><Skeleton className="h-40 rounded-3xl" label="Loading assignment" /><Skeleton className="h-72 rounded-3xl" label="Loading assignment files" /></main></AppShell>
  if (loadError || !assignment || !classroom) return <AppShell><PageHeader eyebrow="ASSIGNMENT" title="Assignment unavailable" subtitle="This assignment could not be opened." /><main className="app-shell__content grid gap-4"><Alert tone="error" label="Assignment unavailable" action={<Button type="button" variant="secondary" onClick={() => { setLoading(true); setLoadError(''); setRetry((value) => value + 1) }}>Retry</Button>}>{loadError || 'Class details are unavailable.'}</Alert><Button to={backTo} variant="secondary"><ArrowLeft size={16} aria-hidden="true" /> Back to assignments</Button></main></AppShell>

  const issue = getPublishIssue({ ...assignment, title })
  const published = assignment.status === 'published'
  return <AppShell>
    <PageHeader eyebrow={published ? 'PUBLISHED ASSIGNMENT' : 'DRAFT ASSIGNMENT'} title={assignment.title || 'Untitled assignment'} subtitle={classroom.name} action={<Button to={backTo} variant="secondary"><ArrowLeft size={16} aria-hidden="true" /> Back to assignments</Button>} />
    <main className="app-shell__content grid gap-6" id="main-content">
      <nav className="module-breadcrumb" aria-label="Breadcrumb"><Link to="/instructor">Classes</Link><span aria-hidden="true">›</span><Link to={backTo}>{classroom.name}</Link><span aria-hidden="true">›</span><span aria-current="page">{assignment.title}</span></nav>
      <SectionCard title="Details" description="Changes save automatically." icon={<ClipboardList size={20} />} action={<div className="module-save-state" role="status" aria-live="polite">{saveState === 'saving' ? 'Saving…' : saveState === 'error' ? <><span>Couldn’t save</span><Button type="button" variant="ghost" onClick={() => setSaveRetry((value) => value + 1)}>Retry</Button></> : 'All changes saved'}</div>}>
        <div className="assignment-fields">
          <Input label="Title" name="assignment-title" value={title} maxLength={MAX_TITLE_LENGTH} onChange={(event) => edit(setTitle, event.target.value)} error={!title.trim() ? 'A title is required.' : undefined} />
          <Textarea label="Instructions" name="assignment-instructions" value={instructions} maxLength={MAX_INSTRUCTIONS_LENGTH} rows={6} onChange={(event) => edit(setInstructions, event.target.value)} hint={`Optional · up to ${MAX_INSTRUCTIONS_LENGTH} characters`} />
          <div className="assignment-fields assignment-fields--two">
            <DueDateTimeField value={due} onChange={(value) => edit(setDue, value)} />
            <Input label="Points" name="assignment-points" inputMode="numeric" value={points} onChange={(event) => edit(setPoints, event.target.value)} error={pointsError} hint={pointsError ? undefined : 'Optional · leave blank for ungraded'} />
          </div>
        </div>
      </SectionCard>
      <AttachmentsSection files={assignment.attachments} drive={drive} onChange={(attachments) => patch({ attachments })} />
      <TurnInSettings assignment={assignment} onChange={patch} />
      {assignment.acceptsTurnIn && <TurnInsPanel assignment={assignment} />}
      <section className="module-publish-bar" aria-label="Publish assignment">
        <div><strong>{published ? 'Published assignment' : 'Ready to publish?'}</strong><ul><li>{title.trim() ? '✓' : '○'} Title</li><li>{assignment.instructions.trim() || assignment.attachments.length > 0 ? '✓' : '○'} Instructions or a file</li>{assignment.acceptsTurnIn && <li>{assignment.collectorEmail ? '✓' : '○'} Account that receives student work</li>}</ul></div>
        <div className="module-publish-actions">
          {published
            ? <Button type="button" variant="secondary" onClick={() => void togglePublished()}><Send size={16} aria-hidden="true" /> Unpublish</Button>
            : <Button type="button" disabled={Boolean(issue) || saveState !== 'saved'} title={issue ?? undefined} onClick={() => void togglePublished()}><Send size={16} aria-hidden="true" /> Publish</Button>}
        </div>
      </section>
    </main>
  </AppShell>
}
