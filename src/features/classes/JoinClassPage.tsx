import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../../app/AppShell'
import { locationPath, rememberReturnTo } from '../../app/returnTo'
import { useAuth } from '../auth/useAuth'
import { saveRoleIntent } from '../auth/roleIntent'
import { useUserProfile } from '../profile/useUserProfile'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { Input } from '../../shared/ui/Input'
import { PageHeader } from '../../shared/ui/PageHeader'
import { SectionCard } from '../../shared/ui/SectionCard'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import { isValidJoinCode, normalizeJoinCode } from './joinCode'
import { joinLookupErrorMessage, joinOutcomeMessage, type JoinFeedback } from './joinMessages'
import { getClassCodePreview, joinClass, lookupClassByCode } from './services/joinService'
import type { ClassCodeRecord } from './types'

export function JoinClassPage() {
  const { code: inviteCode } = useParams()
  return <JoinClassFlow key={inviteCode ?? 'manual-join'} inviteCode={inviteCode} />
}

function JoinClassFlow({ inviteCode }: { inviteCode?: string }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, status } = useAuth()
  const { profile, loading: profileLoading } = useUserProfile()
  const { showToast } = useToast()
  const [code, setCode] = useState(() => normalizeJoinCode(inviteCode ?? ''))
  const [preview, setPreview] = useState<ClassCodeRecord | null>(null)
  const [feedback, setFeedback] = useState<JoinFeedback | null>(null)
  const [finding, setFinding] = useState(false)
  const [joining, setJoining] = useState(false)
  const [validationError, setValidationError] = useState('')
  const path = locationPath(location)

  const beginAuth = useCallback((returnPath: string) => {
    saveRoleIntent({ role: 'student', mode: 'signin' })
    rememberReturnTo(returnPath)
    navigate('/signin?mode=signin', { replace: true, state: { from: returnPath } })
  }, [navigate])

  const findPreview = useCallback(async (value: string) => {
    setFinding(true)
    setFeedback(null)
    setPreview(null)
    try {
      const result = user
        ? await lookupClassByCode(value, user.uid)
        : await getClassCodePreview(value)
      if (!result) setFeedback(joinOutcomeMessage('not_found'))
      else { setFeedback(null); setPreview(result) }
    } catch (error) {
      setFeedback(joinLookupErrorMessage(error))
    } finally { setFinding(false) }
  }, [user])

  useEffect(() => {
    if (!inviteCode || status !== 'signedIn' || profileLoading || profile?.role !== 'student' || !user) return undefined
    const normalized = normalizeJoinCode(inviteCode)
    let active = true
    void lookupClassByCode(normalized, user.uid).then((result) => {
      if (!active) return
      if (!result) setFeedback(joinOutcomeMessage('not_found'))
      else { setFeedback(null); setPreview(result) }
    }).catch((error: unknown) => {
      if (active) setFeedback(joinLookupErrorMessage(error))
    })
    return () => { active = false }
  }, [inviteCode, status, profileLoading, profile?.role, user])

  useEffect(() => {
    if (status === 'signedOut' && inviteCode) beginAuth(path)
  }, [status, inviteCode, path, beginAuth])

  useEffect(() => {
    if (status === 'signedIn' && !profileLoading && user && !profile?.role) {
      rememberReturnTo(path)
      navigate('/role?mode=continue', { replace: true, state: { from: path } })
    }
  }, [status, profileLoading, user, profile?.role, path, navigate])

  async function handleFind(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = normalizeJoinCode(code)
    setCode(normalized)
    setValidationError('')
    if (!isValidJoinCode(normalized)) {
      setPreview(null)
      setFeedback(joinOutcomeMessage('not_found'))
      setValidationError('Enter a valid six-character class code.')
      return
    }
    if (!user) {
      beginAuth(`/join/${normalized}`)
      return
    }
    await findPreview(normalized)
  }

  async function handleJoin() {
    if (!user || !profile || !preview || joining) return
    setJoining(true)
    setFeedback(null)
    try {
      const result = await joinClass(code, { uid: user.uid, name: profile.name || user.displayName || 'Student', photoURL: profile.photoURL })
      const nextFeedback = joinOutcomeMessage(result.outcome)
      if (result.outcome === 'joined') {
        showToast('success', nextFeedback.message)
        navigate(`/student/classes/${result.enrollment.classId}`)
      } else {
        setFeedback(nextFeedback)
        if (result.outcome === 'request_already_pending' || result.outcome === 'already_member') showToast('info', nextFeedback.message)
        else if (nextFeedback.tone === 'error') showToast('error', nextFeedback.message)
      }
    } catch (error) {
      const nextFeedback = joinLookupErrorMessage(error)
      setFeedback(nextFeedback)
      showToast('error', nextFeedback.message)
    } finally { setJoining(false) }
  }

  if (status === 'loading' || (status === 'signedIn' && profileLoading)) return <AppShell><PageHeader eyebrow="JOIN A CLASS" title="Checking your account…" subtitle="" /><main className="app-shell__content"><Skeleton className="h-72 rounded-3xl" label="Loading join page" /></main></AppShell>
  if (status === 'signedIn' && profile?.role === 'instructor') return <AppShell><PageHeader eyebrow="JOIN A CLASS" title="Use a student account." subtitle="Class invitations are for learners." /><main className="app-shell__content"><Alert tone="error" label="Instructor account">Use a student account to join a class.</Alert></main></AppShell>

  const feedbackPanel = feedback && <Alert tone={feedback.tone} label={feedback.label}>{feedback.message}{feedback.label === 'Already a member' && preview && <span className="mt-2 block"><Button to={`/student/classes/${preview.classId}`} variant="secondary">Open class</Button></span>}</Alert>
  const previewBlocked = Boolean(preview?.archived || !preview?.joinEnabled)
  const blockedFeedback = preview?.archived ? joinOutcomeMessage('class_archived') : joinOutcomeMessage('joining_paused')

  return <AppShell>
    <PageHeader eyebrow="STUDENT SPACE" title="Join a class." subtitle="Enter the six-character invite code your instructor shared." />
    <main className="app-shell__content grid gap-5" id="main-content">
      <SectionCard title="Find your class" description="Codes use six letters and numbers. Spaces and hyphens are ignored.">
        {status === 'signedOut' && <Alert tone="warning" label="Sign in to continue">You can enter a code now. We’ll keep it ready while you sign in or create your student account.</Alert>}
        {validationError && <Alert tone="error" label="Check the code">{validationError}</Alert>}
        <form className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" onSubmit={(event) => void handleFind(event)}>
          <Input label="Class code" name="class-code" value={code} onChange={(event) => { setCode(normalizeJoinCode(event.target.value)); setValidationError(''); setFeedback(null); setPreview(null) }} placeholder="ABC234" autoCapitalize="characters" autoComplete="off" spellCheck={false} hint={`${code.length}/6 characters · Example: ABC234`} error={validationError} />
          <Button type="submit" disabled={finding || joining || (status === 'signedIn' && profile?.role !== 'student')}>{finding ? 'Finding…' : 'Find class'}</Button>
        </form>
        {feedbackPanel}
      </SectionCard>

      {preview && <SectionCard title={preview.className} description="Class invitation preview">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div><dt className="text-sm font-semibold text-navy-800-72">Section</dt><dd className="m-0">Not included in this invite preview</dd></div>
          <div><dt className="text-sm font-semibold text-navy-800-72">Instructor</dt><dd className="m-0">{preview.ownerName}</dd></div>
        </dl>
        {preview.requireApproval && <Alert tone="warning" label="Instructor approval required">Your request will wait for the instructor before the class appears in your active classes.</Alert>}
        {previewBlocked && <Alert tone="warning" label={blockedFeedback.label}>{blockedFeedback.message}</Alert>}
        {!previewBlocked && <Button type="button" onClick={() => void handleJoin()} disabled={!user || profile?.role !== 'student' || joining}>{joining ? 'Joining…' : preview.requireApproval ? 'Request to join' : 'Join class'}</Button>}
      </SectionCard>}
    </main>
  </AppShell>
}
