import { LogIn, Users } from 'lucide-react'
import { useState } from 'react'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { Input } from '../../../shared/ui/Input'
import { SectionCard } from '../../../shared/ui/SectionCard'
import { createSelfTeam, describeTeamError, joinTeam } from '../../quizzes/services/teamService'
import { isValidCode, normalizeCodeInput } from './teamPlayLogic'

interface TeamEntryProps {
  quizId: string
  uid: string
  teamFormation: 'assigned' | 'self'
  groupSize: number
}

/**
 * A student with no team yet. When the instructor builds the teams there is nothing to do but wait. When students form their own,
 * they either join a team with its code or start one. The team shows up on its own
 * through the live "my team" watcher, so there is nothing to navigate after success.
 */
export function TeamEntry({ quizId, uid: _uid, teamFormation, groupSize }: TeamEntryProps) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<'join' | 'create' | null>(null)
  const [error, setError] = useState('')

  if (teamFormation === 'assigned') {
    return <EmptyState title="Your instructor is building the teams" description="You are not on a team yet. Ask your instructor to add you, then come back to this page. It updates by itself." />
  }

  async function join() {
    setBusy('join'); setError('')
    try { await joinTeam(quizId, normalizeCodeInput(code)) }
    catch (reason) { setError(describeTeamError(reason)) }
    finally { setBusy(null) }
  }

  async function create() {
    setBusy('create'); setError('')
    try { await createSelfTeam(quizId, name.trim(), null) }
    catch (reason) { setError(describeTeamError(reason)) }
    finally { setBusy(null) }
  }

  const codeOk = isValidCode(code)
  const nameOk = name.trim().length >= 1 && name.trim().length <= 40
  return <div className="grid gap-5">
    {error && <Alert tone="error" label="That did not work">{error}</Alert>}
    <SectionCard title="Join a team" description="Ask a teammate for their 6-character team code." icon={<LogIn size={20} />}>
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <Input label="Team code" name="team-code" value={code} onChange={event => setCode(event.target.value)} autoComplete="off" autoCapitalize="characters" maxLength={8} placeholder="ABC-234"
          error={code.length > 0 && !codeOk ? 'Codes have 6 letters and numbers.' : undefined} />
        <Button type="button" disabled={!codeOk || busy !== null} onClick={() => void join()}>{busy === 'join' ? 'Joining…' : 'Join team'}</Button>
      </div>
    </SectionCard>
    <SectionCard title="Start a new team" description={`Teams have up to ${groupSize} members. You get a code to share.`} icon={<Users size={20} />}>
      <div className="grid gap-3">
        <Input label="Team name" name="new-team-name" value={name} onChange={event => setName(event.target.value)} maxLength={40} autoComplete="off" />
        <div><Button type="button" disabled={!nameOk || busy !== null} onClick={() => void create()}>{busy === 'create' ? 'Creating…' : 'Create team'}</Button></div>
      </div>
    </SectionCard>
  </div>
}
