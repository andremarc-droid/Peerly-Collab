import { Undo2, Upload } from 'lucide-react'
import { useState } from 'react'
import { Alert } from '../../shared/ui/Alert'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { SectionCard } from '../../shared/ui/SectionCard'
import { useToast } from '../../shared/ui/useToast'
import { AddFileButtons } from './AddFileButtons'
import { describeDriveError, mergeFiles } from './drive'
import { FileList } from './FileList'
import { formatGrade, formatTurnedIn, turnInState, turnInStateLabel } from './format'
import { submitTurnIn, withdrawTurnIn } from './services'
import { MAX_TURN_IN_FILES, type AssignmentWithId, type DriveFile, type TurnInWithId } from './types'
import type { GoogleDriveApi } from './useGoogleDrive'

interface StudentTurnInProps {
  assignment: AssignmentWithId
  turnIn: TurnInWithId | null
  studentId: string
  studentName: string
  drive: GoogleDriveApi
}

/**
 * The student picks files from their own Drive. Turning in first shares them, view-only, with the instructor's
 * account, then saves only the file references. Nothing is uploaded to this app.
 */
export function StudentTurnIn({ assignment, turnIn, studentId, studentName, drive }: StudentTurnInProps) {
  const { showToast } = useToast()
  const [draft, setDraft] = useState<DriveFile[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [replacing, setReplacing] = useState(false)
  const state = turnInState(assignment, turnIn)
  const collector = assignment.collectorEmail
  const busy = drive.busy || saving
  const editing = (!turnIn || replacing) && !turnIn?.gradedAt
  const graded = Boolean(turnIn?.gradedAt)

  function added(incoming: DriveFile[]) {
    const { files, truncated } = mergeFiles(draft, incoming, MAX_TURN_IN_FILES)
    setDraft(files)
    if (truncated) showToast('info', `You can turn in up to ${MAX_TURN_IN_FILES} files.`)
  }

  async function turnInNow() {
    if (!collector || draft.length === 0) return
    setError(''); setSaving(true)
    try {
      await drive.shareWithUser(draft, collector)
      await submitTurnIn({ classId: assignment.classId, assignmentId: assignment.id, studentId, studentName, files: draft })
      setDraft([]); setReplacing(false)
      showToast('success', 'Turned in. Your instructor can now open your files.')
    } catch (reason) {
      const { message, silent } = describeDriveError(reason, 'Your work could not be turned in. Nothing was submitted.')
      if (!silent) setError(message)
    } finally { setSaving(false) }
  }

  async function withdraw() {
    setWithdrawOpen(false); setSaving(true); setError('')
    try {
      await withdrawTurnIn(assignment.classId, assignment.id, studentId)
      showToast('info', 'Turn-in withdrawn. Your instructor can still open the files you already shared until you change their sharing in Google Drive.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The turn-in could not be withdrawn.') }
    finally { setSaving(false) }
  }

  if (!assignment.acceptsTurnIn) return <SectionCard title="Your work" icon={<Upload size={20} />}><p className="m-0 text-base">Nothing to turn in for this assignment.</p></SectionCard>
  if (!collector) return <SectionCard title="Your work" icon={<Upload size={20} />}><Alert tone="info" label="Turn-in is not ready">Your instructor has not finished setting up turn-in for this assignment yet.</Alert></SectionCard>

  return <SectionCard title="Your work" description={turnIn ? `${turnInStateLabel[state]} · ${formatTurnedIn(turnIn.turnedInAt)}` : turnInStateLabel[state]} icon={<Upload size={20} />}
    action={<Badge>{turnInStateLabel[state]}</Badge>}>
    {turnIn && <FileList files={turnIn.files} label="Files you turned in" />}
    {turnIn?.gradedAt && <div className="grade-card" role="status" aria-label="Your grade">
      <h3>Your grade</h3>
      {turnIn.grade !== null && <p className="grade-card__score">{formatGrade(turnIn.grade, assignment.points)}</p>}
      {turnIn.feedback && <><h4>Feedback from your instructor</h4><p className="assignment-instructions">{turnIn.feedback}</p></>}
      <p className="turn-in-card__time">Graded {formatTurnedIn(turnIn.gradedAt)}. This work is locked. Ask your instructor if you need to change it.</p>
    </div>}
    {editing && <div className="assignment-block">
      <h3>{turnIn ? 'Replace your files' : 'Add your files'}</h3>
      <p>Upload up to {MAX_TURN_IN_FILES} files from your computer, or choose them from your Google Drive. Uploaded files are saved in your own Drive. When you turn in, they are shared view-only with <strong>{collector}</strong>.</p>
      {drive.configIssue && <Alert tone="warning" label="Google Drive is not set up">{drive.configIssue}</Alert>}
      <AddFileButtons remaining={MAX_TURN_IN_FILES - draft.length} drive={drive} disabled={saving} onAdded={added} onError={setError} />
      {draft.length > 0 && <FileList files={draft} label="Files ready to turn in" onRemove={(file) => setDraft((items) => items.filter((item) => item.fileId !== file.fileId))} disabled={busy} />}
      <div className="assignment-actions">
        <Button type="button" disabled={busy || draft.length === 0} onClick={() => void turnInNow()}><Upload size={16} aria-hidden="true" /> {saving ? 'Turning in…' : turnIn ? 'Turn in again' : 'Turn in'}</Button>
        {replacing && <Button type="button" variant="tertiary" disabled={busy} onClick={() => { setReplacing(false); setDraft([]) }}>Cancel</Button>}
      </div>
    </div>}
    {error && <Alert tone="error" label="Not turned in">{error}</Alert>}
    {turnIn && !replacing && !graded && <div className="assignment-actions">
      <Button type="button" variant="secondary" disabled={busy} onClick={() => setReplacing(true)}>Replace files</Button>
      <Button type="button" variant="secondary" disabled={busy} onClick={() => setWithdrawOpen(true)}><Undo2 size={16} aria-hidden="true" /> Withdraw</Button>
    </div>}
    <ConfirmDialog open={withdrawOpen} onClose={() => setWithdrawOpen(false)} onConfirm={() => void withdraw()} title="Withdraw your turn-in?" description="Your instructor will no longer see this turn-in. Your files stay in your Google Drive, and your instructor’s account keeps view access until you remove it in Drive’s Share settings." confirmLabel="Withdraw" />
  </SectionCard>
}
