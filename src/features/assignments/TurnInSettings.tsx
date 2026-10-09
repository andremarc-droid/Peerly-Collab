import { Inbox, UserCheck } from 'lucide-react'
import { useState } from 'react'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { SectionCard } from '../../shared/ui/SectionCard'
import { Switch } from '../../shared/ui/Switch'
import { useToast } from '../../shared/ui/useToast'
import { describeDriveError } from './drive'
import type { AssignmentWithId } from './types'
import type { GoogleDriveApi } from './useGoogleDrive'

interface TurnInSettingsProps {
  assignment: Pick<AssignmentWithId, 'acceptsTurnIn' | 'collectorEmail' | 'status'>
  drive: GoogleDriveApi
  disabled?: boolean
  onChange: (patch: { acceptsTurnIn?: boolean; collectorEmail?: string | null }) => Promise<void>
}

/**
 * Students share their own Drive files with one Google account chosen here. We store only that address
 * and file references, never the files, and nothing is emailed to anyone.
 */
export function TurnInSettings({ assignment, drive, disabled = false, onChange }: TurnInSettingsProps) {
  const { showToast } = useToast()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const busy = drive.busy || saving

  async function save(patch: { acceptsTurnIn?: boolean; collectorEmail?: string | null }, message: string) {
    setError(''); setSaving(true)
    try { await onChange(patch); showToast('success', message) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The setting could not be saved.') }
    finally { setSaving(false) }
  }

  async function connect() {
    setError('')
    try {
      const account = await drive.connect(true)
      await save({ collectorEmail: account.email }, `Student work will be shared with ${account.email}.`)
    } catch (reason) {
      const { message, silent } = describeDriveError(reason, 'The Google account could not be connected.')
      if (!silent) setError(message)
    }
  }

  return <SectionCard title="Student turn-in" description="Let students hand in files from their own Google Drive." icon={<Inbox size={20} />}>
    <Switch label="Accept turn-ins" hint={assignment.acceptsTurnIn ? 'Students can attach up to 5 files.' : 'Students only see the instructions and files.'} checked={assignment.acceptsTurnIn} disabled={disabled || busy} onChange={(event) => void save({ acceptsTurnIn: event.target.checked }, event.target.checked ? 'Turn-in is on.' : 'Turn-in is off.')} />
    {assignment.acceptsTurnIn && <div className="assignment-block">
      <h3>Account that receives student work</h3>
      <p>Students share their files, view-only, with this Google account. Open their work while signed in to it. Students can see this address on the assignment.</p>
      {assignment.collectorEmail
        ? <p className="m-0 flex flex-wrap items-center gap-2 text-base text-navy-900"><UserCheck size={18} aria-hidden="true" /> <strong>{assignment.collectorEmail}</strong></p>
        : <Alert tone="warning" label="No account connected">Connect a Google account before publishing, or turn turn-in off.</Alert>}
      <div className="assignment-actions">
        <Button type="button" variant="secondary" disabled={disabled || busy || Boolean(drive.configIssue)} onClick={() => void connect()}>{assignment.collectorEmail ? 'Use a different account' : 'Connect Google account'}</Button>
      </div>
      {drive.configIssue && <Alert tone="warning" label="Google Drive is not set up">{drive.configIssue}</Alert>}
    </div>}
    {error && <Alert tone="error" label="Turn-in settings">{error}</Alert>}
  </SectionCard>
}
