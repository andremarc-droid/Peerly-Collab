import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { findLearningInviteCode } from './inviteCodes'

function invitePath(target: Awaited<ReturnType<typeof findLearningInviteCode>>): string {
  const itemId = encodeURIComponent(target.itemId)
  const token = encodeURIComponent(target.inviteToken)
  if (target.kind === 'tutor') return `/learning/tutor/${itemId}/${token}`
  const classId = encodeURIComponent(target.classId)
  if (target.kind === 'canvas') return `/learning/join/${classId}/${itemId}/${token}`
  if (target.kind === 'flashcard') return `/learning/join/deck/${classId}/${itemId}/${token}`
  if (target.kind === 'graph') return `/learning/join-graph/${classId}/${itemId}/${token}`
  return '/learning'
}

export function LearningInviteCodeInput() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const join = async () => {
    setBusy(true)
    setError(null)
    try {
      const target = await findLearningInviteCode(code)
      navigate(invitePath(target))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not check that invite code.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="invite-code grid gap-2">
      <form
        className="invite-code__form flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void join()
        }}
      >
        <label className="sr-only" htmlFor="learning-invite-code">Enter a learning invite code</label>
        <input
          id="learning-invite-code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          autoComplete="off"
          maxLength={10}
          placeholder="Invite code"
          className="invite-code__input min-h-11 w-36 rounded-xl border border-navy-900-30 bg-white px-3 text-sm uppercase tracking-widest text-navy-900 placeholder:normal-case placeholder:tracking-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-800"
        />
        <Button type="submit" variant="secondary" disabled={busy || code.trim().length === 0}>
          <KeyRound size={16} aria-hidden="true" />
          <span>{busy ? 'Checking…' : 'Join'}<span className="invite-code__suffix"> with code</span></span>
        </Button>
      </form>
      {error && <Alert tone="error" label="Invite code not accepted">{error}</Alert>}
    </div>
  )
}
