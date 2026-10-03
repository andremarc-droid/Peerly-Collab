import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '../../app/AppShell'
import { useAuth } from '../auth/useAuth'
import { useUserProfile } from '../profile/useUserProfile'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { PageHeader } from '../../shared/ui/PageHeader'
import { SectionCard } from '../../shared/ui/SectionCard'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import { joinClass, lookupClassByCode, JoinLookupCooldownError } from './services/joinService'
import type { ClassCodeRecord, JoinOutcome } from './types'

export function JoinClassPage() {
  const { code = '' } = useParams()
  const { user } = useAuth()
  const uid = user?.uid
  const { profile } = useUserProfile()
  const { showToast } = useToast()
  const [preview, setPreview] = useState<ClassCodeRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [joining, setJoining] = useState(false)
  const [outcome, setOutcome] = useState<JoinOutcome | null>(null)

  useEffect(() => {
    if (!uid) return undefined
    let active = true
    lookupClassByCode(code, uid).then((value) => {
      if (!active) return
      setPreview(value); setError(value ? '' : 'No active class uses this code. Check it with your instructor and try again.')
    }).catch((reason: unknown) => {
      if (!active) return
      setError(reason instanceof JoinLookupCooldownError ? reason.message : reason instanceof Error ? reason.message : 'This class could not be looked up.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [code, uid, retry])

  async function join() {
    if (!user || !profile || !preview || joining) return
    setJoining(true); setOutcome(null)
    try {
      const result = await joinClass(code, { uid: user.uid, name: profile.name || user.displayName || 'Student', photoURL: profile.photoURL }, undefined)
      setOutcome(result)
      const messages: Record<JoinOutcome['outcome'], string> = {
        joined: 'You joined the class.', pending_approval: 'Your request is waiting for instructor approval.',
        already_member: 'You are already in this class.', blocked: 'You cannot rejoin this class while blocked.',
        joining_paused: 'Joining is paused for this class.', class_archived: 'This class is archived.',
        instructor_cannot_join: 'Instructor accounts cannot join classes as students.', not_found: 'This class code could not be found.',
      }
      showToast(result.outcome === 'joined' || result.outcome === 'pending_approval' || result.outcome === 'already_member' ? 'success' : 'error', messages[result.outcome])
    } catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'The join request could not be completed.') }
    finally { setJoining(false) }
  }

  return <AppShell>
    <PageHeader eyebrow="JOIN A CLASS" title="Learn together." subtitle="Check the class details, then join with your invite code." />
    <main className="app-shell__content grid gap-5" id="main-content">
      {loading ? <Skeleton className="h-64 rounded-3xl" label="Looking up class code" /> : error ? <Alert tone="error" label="Class not found" action={<Button type="button" variant="secondary" onClick={() => { setLoading(true); setError(''); setRetry((value) => value + 1) }}>Try again</Button>}>{error}</Alert> : preview && <SectionCard title={preview.className} description={`Instructor ${preview.ownerName}`}>
        <p className="m-0 font-mono text-xl font-semibold tracking-[0.2em]">{code.toUpperCase()}</p>
        {outcome?.outcome === 'joined' && <Alert tone="success" label="You’re in">You joined this class and can see its published quizzes.</Alert>}
        {outcome?.outcome === 'pending_approval' && <Alert tone="warning" label="Request sent">Your instructor needs to approve your request before you can see class quizzes.</Alert>}
        {outcome?.outcome === 'already_member' && <Alert tone="success" label="Already a member">You are already enrolled in this class.</Alert>}
        {outcome?.outcome === 'blocked' && <Alert tone="error" label="Join unavailable">You cannot rejoin while your enrollment is blocked.</Alert>}
        {preview.archived || !preview.joinEnabled ? <Alert tone="warning" label={preview.archived ? 'Class archived' : 'Joining paused'}>Ask the instructor for an update before trying to join.</Alert> : <Button type="button" onClick={() => void join()} disabled={joining || outcome?.outcome === 'pending_approval' || outcome?.outcome === 'joined' || outcome?.outcome === 'already_member' || outcome?.outcome === 'blocked'}>{joining ? 'Joining…' : preview.requireApproval ? 'Request to join' : 'Join class'}</Button>}
      </SectionCard>}
    </main>
  </AppShell>
}
