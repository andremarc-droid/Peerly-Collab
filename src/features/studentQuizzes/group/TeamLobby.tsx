import { Copy, Crown, DoorOpen, Play } from 'lucide-react'
import { useState } from 'react'
import { Alert } from '../../../shared/ui/Alert'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { SectionCard } from '../../../shared/ui/SectionCard'
import { Select } from '../../../shared/ui/Select'
import { useToast } from '../../../shared/ui/useToast'
import type { GroupParticipation } from '../../quizzes/types'
import { describeTeamError, leaveTeam, setRepresentative, startTeamAttempt } from '../../quizzes/services/teamService'
import type { Team } from '../../quizzes/types/team'
import { MIN_MEMBERS_TO_START, describeGroupRules, formatCode, startHint } from './teamPlayLogic'

interface TeamLobbyProps {
  quizId: string
  team: Team
  settings: GroupParticipation
  uid: string
}

/** Before the quiz starts: who is on the team, the rules, and the Start button. Updates live as teammates join or leave. */
export function TeamLobby({ quizId, team, settings, uid }: TeamLobbyProps) {
  const { showToast } = useToast()
  const [busy, setBusy] = useState<'start' | 'leave' | 'rep' | null>(null)
  const [error, setError] = useState('')
  const [leaving, setLeaving] = useState(false)
  const selfFormed = team.code !== null
  const canStart = team.memberIds.length >= MIN_MEMBERS_TO_START

  async function run(kind: 'start' | 'leave' | 'rep', action: () => Promise<unknown>) {
    setBusy(kind); setError('')
    try { await action() }
    catch (reason) { setError(describeTeamError(reason)) }
    finally { setBusy(null) }
  }

  async function copyCode() {
    if (!team.code) return
    try { await navigator.clipboard.writeText(team.code); showToast('success', 'Team code copied.') }
    catch { showToast('error', 'Could not copy. Read the code out loud instead.') }
  }

  return <div className="grid gap-5">
    {error && <Alert tone="error" label="That did not work">{error}</Alert>}
    <SectionCard title={team.name} description={startHint(team, settings.groupSize)} icon={<DoorOpen size={20} />}
      action={team.code && <Button type="button" variant="secondary" onClick={() => void copyCode()} aria-label={`Copy team code ${formatCode(team.code)}`}><Copy size={16} aria-hidden="true" /> Code {formatCode(team.code)}</Button>}>
      <ul className="m-0 grid list-none gap-2 p-0" aria-label="Team members">
        {team.memberIds.map(id => <li key={id} className="flex flex-wrap items-center gap-2">
          <strong>{team.memberNames[id] || 'Student'}</strong>
          {id === uid && <Badge>You</Badge>}
          {id === team.representativeId && <Badge className="inline-flex items-center gap-1"><Crown size={12} aria-hidden="true" /> Representative</Badge>}
        </li>)}
      </ul>
      {selfFormed && settings.answerMode === 'representative' && team.memberIds.length > 1 && <div className="mt-4">
        <Select label="Representative" name="representative" value={team.representativeId} disabled={busy !== null}
          onChange={event => void run('rep', () => setRepresentative(quizId, team.id, event.target.value))}
          options={team.memberIds.map(id => ({ value: id, label: team.memberNames[id] || 'Student' }))} hint="This teammate submits the answers for everyone." />
      </div>}
    </SectionCard>

    <SectionCard title="How this quiz works" description="Everyone on the team sees the same questions at the same time.">
      <ul className="m-0 grid gap-2 pl-5">{describeGroupRules(settings).map(line => <li key={line}>{line}</li>)}</ul>
    </SectionCard>

    <div className="flex flex-wrap gap-3">
      <Button type="button" disabled={!canStart || busy !== null} onClick={() => void run('start', () => startTeamAttempt(quizId, team.id))}><Play size={17} aria-hidden="true" /> {busy === 'start' ? 'Starting…' : 'Start quiz for the team'}</Button>
      {selfFormed && <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => setLeaving(true)}>Leave team</Button>}
      <Button to="/student" variant="secondary">Back to practice</Button>
    </div>
    {!canStart && <p className="m-0" role="status">Starting unlocks when at least {MIN_MEMBERS_TO_START} people are on the team.</p>}

    <ConfirmDialog open={leaving} onClose={() => setLeaving(false)} title="Leave this team?" description="You can join again later with the team code if there is room." confirmLabel="Leave team"
      onConfirm={() => void run('leave', () => leaveTeam(quizId, team.id))} />
  </div>
}
