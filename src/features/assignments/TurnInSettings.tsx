import { Inbox, UserCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { Alert } from '../../shared/ui/Alert'
import { SectionCard } from '../../shared/ui/SectionCard'
import { Switch } from '../../shared/ui/Switch'
import { useToast } from '../../shared/ui/useToast'
import type { AssignmentWithId } from './types'

interface TurnInSettingsProps {
  assignment: Pick<AssignmentWithId, 'acceptsTurnIn' | 'collectorEmail' | 'status'>
  disabled?: boolean
  onChange: (patch: { acceptsTurnIn?: boolean; collectorEmail?: string | null }) => Promise<void>
}

/**
 * Students share their Drive files with the instructor's Peerly account email. The files themselves stay in Drive.
 */
export function TurnInSettings({ assignment, disabled = false, onChange }: TurnInSettingsProps) {
  const { user } = useAuth()
  const appEmail = user?.email?.trim() || ''
  const { showToast } = useToast()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const busy = saving

  useEffect(() => {
    const email = appEmail
    if (!assignment.acceptsTurnIn || assignment.collectorEmail || !email) return undefined
    let current = true
    setError('')
    setSaving(true)
    void onChange({ collectorEmail: email }).catch((reason: unknown) => {
      if (current) setError(reason instanceof Error ? reason.message : 'Your account email could not be saved for turn-ins.')
    }).finally(() => { if (current) setSaving(false) })
    return () => { current = false }
  }, [assignment.acceptsTurnIn, assignment.collectorEmail, onChange, appEmail])

  async function save(patch: { acceptsTurnIn?: boolean; collectorEmail?: string | null }, message: string) {
    setError(''); setSaving(true)
    try { await onChange(patch); showToast('success', message) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The setting could not be saved.') }
    finally { setSaving(false) }
  }

  return <SectionCard title="Student turn-in" description="Let students hand in files from their own Google Drive." icon={<Inbox size={20} />}>
    <Switch label="Accept turn-ins" hint={assignment.acceptsTurnIn ? 'Students can attach up to 5 files.' : 'Students only see the instructions and files.'} checked={assignment.acceptsTurnIn} disabled={disabled || busy} onChange={(event) => void save({ acceptsTurnIn: event.target.checked }, event.target.checked ? 'Turn-in is on.' : 'Turn-in is off.')} />
    {assignment.acceptsTurnIn && <div className="assignment-block">
      <h3>Account that receives student work</h3>
      <p>Students share their files, view-only, with the email shown. It must be a Google account. Open files in Drive while signed in to that same account.</p>
      {(assignment.collectorEmail || appEmail)
        ? <p className="m-0 flex flex-wrap items-center gap-2 text-base text-navy-900"><UserCheck size={18} aria-hidden="true" /> <strong>{assignment.collectorEmail || appEmail}</strong>{saving && <span className="text-sm">Saving…</span>}</p>
        : <Alert tone="warning" label="No account email available">Add an email to your Peerly account before publishing an assignment that accepts turn-ins.</Alert>}
      <p className="m-0 text-sm text-navy-800-72">New assignments use your Peerly sign-in email automatically. Previously configured assignments keep their existing recipient to preserve access to earlier submissions. Peerly can’t silently sign in to Google Drive.</p>
    </div>}
    {error && <Alert tone="error" label="Turn-in settings">{error}</Alert>}
  </SectionCard>
}
