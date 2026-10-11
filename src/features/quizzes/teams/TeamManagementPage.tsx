import { Crown, Shuffle, Trash2, UserMinus, UserPlus, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '../../../app/AppShell'
import { useAuth } from '../../auth/useAuth'
import { Alert } from '../../../shared/ui/Alert'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { Checkbox } from '../../../shared/ui/Checkbox'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { Dialog } from '../../../shared/ui/Dialog'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { Input } from '../../../shared/ui/Input'
import { PageHeader } from '../../../shared/ui/PageHeader'
import { Select } from '../../../shared/ui/Select'
import { SectionCard } from '../../../shared/ui/SectionCard'
import { Skeleton } from '../../../shared/ui/Skeleton'
import { StatRow, StatTile } from '../../../shared/ui/StatTile'
import { useToast } from '../../../shared/ui/useToast'
import { getClass } from '../../classes/services/classService'
import { listEnrollments } from '../../classes/services/enrollmentService'
import { getQuiz, type QuizRecord } from '../services/quizService'
import { addTeamMember, createTeam, deleteTeam, describeTeamError, removeTeamMember, setRepresentative, watchQuizTeams } from '../services/teamService'
import type { Team } from '../types/team'
import {
  MAX_TEAMS_PER_QUIZ, TEAM_NAME_MAX, autoAssignDrafts, isDuplicateTeamName, isTeamEditable, memberLabel, rosterFromEnrollments,
  teamHint, teamStatusLabel, unassignedStudents, validateTeamDraft, type RosterStudent, type TeamDraft,
} from './teamManagementLogic'

/** The server limits team changes to 30 per 10 minutes per instructor, so one auto-assign run creates at most this many teams. */
const AUTO_ASSIGN_PER_RUN = 25

export function TeamManagementPage() {
  const { quizId = '' } = useParams()
  const { user } = useAuth()
  const { showToast } = useToast()
  const [quiz, setQuiz] = useState<QuizRecord | null>(null)
  const [className, setClassName] = useState('')
  const [roster, setRoster] = useState<RosterStudent[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [teamsLoaded, setTeamsLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [teamsError, setTeamsError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [newTeamOpen, setNewTeamOpen] = useState(false)
  const [autoOpen, setAutoOpen] = useState(false)
  const [deleting, setDeleting] = useState<Team | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(async () => {
    if (!user) return null
    const found = await getQuiz(quizId)
    if (!found || found.ownerId !== user.uid) throw new Error('Teams can only be managed by the quiz owner.')
    if (found.settings.participation.type !== 'group') throw new Error('This quiz is not a group quiz. Turn on group participation in the quiz settings first.')
    if (!found.classId) throw new Error('Link this quiz to a class first, so students can be put on teams.')
    const [linked, enrollments] = await Promise.all([getClass(found.classId), listEnrollments(found.classId, found.ownerId)])
    return { quiz: found, className: linked?.name ?? 'Class', roster: rosterFromEnrollments(enrollments) }
  }, [quizId, user])

  useEffect(() => {
    let active = true
    setLoading(true)
    void load().then(data => {
      if (!active || !data) return
      setError(''); setQuiz(data.quiz); setClassName(data.className); setRoster(data.roster)
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Teams could not be loaded.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [load, reloadKey])

  useEffect(() => {
    if (!quiz) return undefined
    setTeamsLoaded(false)
    return watchQuizTeams(quiz.id, items => { setTeams(items); setTeamsError(''); setTeamsLoaded(true) },
      reason => { setTeamsError(reason.message || 'Teams could not be loaded.'); setTeamsLoaded(true) })
  }, [quiz])

  const group = quiz?.settings.participation.type === 'group' ? quiz.settings.participation : null
  const assigned = group?.teamFormation === 'assigned'
  const waiting = useMemo(() => unassignedStudents(roster, teams), [roster, teams])
  const atCap = teams.length >= MAX_TEAMS_PER_QUIZ

  async function run(key: string, action: () => Promise<unknown>, success: string): Promise<boolean> {
    setBusy(key)
    try { await action(); showToast('success', success); return true }
    catch (reason) { showToast('error', describeTeamError(reason)); return false }
    finally { setBusy(null) }
  }

  async function createOne(draft: TeamDraft) {
    if (!quiz) return
    const ok = await run('create', () => createTeam(quiz.id, draft.name.trim(), draft.memberIds, draft.representativeId), `${draft.name.trim()} was created.`)
    if (ok) setNewTeamOpen(false)
  }

  async function createMany(drafts: TeamDraft[]) {
    if (!quiz) return
    setBusy('auto')
    let made = 0
    try {
      for (const draft of drafts) { await createTeam(quiz.id, draft.name, draft.memberIds, draft.representativeId); made += 1 }
      showToast('success', `${made} ${made === 1 ? 'team was' : 'teams were'} created.`)
      setAutoOpen(false)
    } catch (reason) {
      showToast('error', `${made} of ${drafts.length} teams were created before this stopped. ${describeTeamError(reason)}`)
      setAutoOpen(false)
    } finally { setBusy(null) }
  }

  if (loading) return <AppShell><main className="app-shell__content grid gap-4"><Skeleton label="Loading teams" className="h-40 rounded-3xl" /><Skeleton label="Loading students" className="h-72 rounded-3xl" /></main></AppShell>
  if (error || !quiz || !group) return <AppShell><PageHeader eyebrow="INSTRUCTOR · TEAMS" title="Teams unavailable." subtitle="We couldn’t open the team workspace for this quiz." /><main className="app-shell__content"><Alert tone="error" label="Teams unavailable" action={<Button type="button" variant="secondary" onClick={() => setReloadKey(key => key + 1)}>Retry</Button>}>{error || 'Teams could not be loaded.'}</Alert></main></AppShell>

  const playing = teams.filter(team => team.status === 'in_progress').length
  const submitted = teams.filter(team => team.status === 'submitted').length

  return <AppShell>
    <PageHeader eyebrow="INSTRUCTOR · TEAMS" title={quiz.title || 'Group quiz'} subtitle={`Teams of up to ${group.groupSize} · ${className}`}
      action={assigned && <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={waiting.length === 0 || atCap || busy !== null} onClick={() => setAutoOpen(true)}><Shuffle size={17} aria-hidden="true" /> Auto-assign</Button>
        <Button type="button" disabled={waiting.length === 0 || atCap || busy !== null} onClick={() => setNewTeamOpen(true)}><Users size={17} aria-hidden="true" /> New team</Button>
      </div>} />
    <main className="app-shell__content grid gap-6" id="main-content">
      {!assigned && <Alert tone="info" label="Students form their own teams">Students create a team with a code (or from a study group) in this quiz. You can still change the representative, remove a member or delete a team that has not started.</Alert>}
      {teamsError && <Alert tone="error" label="Teams could not be updated" action={<Button type="button" variant="secondary" onClick={() => setReloadKey(key => key + 1)}>Retry</Button>}>{teamsError}</Alert>}
      {atCap && <Alert tone="warning" label="Team limit reached">A quiz can have at most {MAX_TEAMS_PER_QUIZ} teams.</Alert>}
      <StatRow>
        <StatTile variant="navy" label="Teams" value={String(teams.length)} hint={`${playing} playing · ${submitted} submitted`} />
        <StatTile label="Students in class" value={String(roster.length)} hint="Active students only" />
        <StatTile label="Not on a team" value={String(waiting.length)} hint={waiting.length === 0 ? 'Everyone has a team' : 'Still need a team'} />
      </StatRow>

      {waiting.length > 0 && <SectionCard title="Not on a team yet" description={assigned ? 'Add them with New team, Auto-assign, or the Add member menu on a team.' : 'They can join with a team code or start their own team.'}>
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Students without a team">{waiting.map(student => <li key={student.uid}><Badge>{student.name}</Badge></li>)}</ul>
      </SectionCard>}

      {!teamsLoaded ? <Skeleton label="Loading teams" className="h-40 rounded-3xl" />
        : teams.length === 0 ? <EmptyState title="No teams yet" description={assigned ? 'Create a team or use Auto-assign to split the class into balanced teams.' : 'Teams appear here as students create them.'} />
        : <ul className="m-0 grid list-none gap-4 p-0" aria-label="Teams">{teams.map(team => <li key={team.id}>
          <TeamCard team={team} groupSize={group.groupSize} roster={roster} waiting={waiting} busy={busy} onRun={run}
            onAdd={memberId => run(`add-${team.id}`, () => addTeamMember(quiz.id, team.id, memberId), 'Student added.')}
            onRemove={memberId => run(`remove-${team.id}-${memberId}`, () => removeTeamMember(quiz.id, team.id, memberId), 'Student removed.')}
            onRepresentative={memberId => run(`rep-${team.id}`, () => setRepresentative(quiz.id, team.id, memberId), 'Representative changed.')}
            onDelete={() => setDeleting(team)} />
        </li>)}</ul>}
    </main>

    {newTeamOpen && <NewTeamDialog students={waiting} groupSize={group.groupSize} teams={teams} busy={busy === 'create'} onClose={() => setNewTeamOpen(false)} onCreate={createOne} />}
    {autoOpen && <AutoAssignDialog students={waiting} groupSize={group.groupSize} teams={teams} busy={busy === 'auto'} onClose={() => setAutoOpen(false)} onCreate={createMany} />}
    <ConfirmDialog open={deleting !== null} onClose={() => setDeleting(null)} busy={busy === 'delete'} closeOnConfirm
      onConfirm={() => { const target = deleting; if (target) void run('delete', () => deleteTeam(quiz.id, target.id), `${target.name} was deleted.`) }}
      title={deleting ? `Delete ${deleting.name}?` : 'Delete team?'} description="Its members go back to “Not on a team yet”. Their answers for this team are removed." confirmLabel="Delete team" />
  </AppShell>
}

interface TeamCardProps {
  team: Team
  groupSize: number
  roster: RosterStudent[]
  waiting: RosterStudent[]
  busy: string | null
  onRun: (key: string, action: () => Promise<unknown>, success: string) => Promise<boolean>
  onAdd: (memberId: string) => Promise<boolean>
  onRemove: (memberId: string) => Promise<boolean>
  onRepresentative: (memberId: string) => Promise<boolean>
  onDelete: () => void
}

function TeamCard({ team, groupSize, roster, waiting, busy, onAdd, onRemove, onRepresentative, onDelete }: TeamCardProps) {
  const [toAdd, setToAdd] = useState('')
  const editable = isTeamEditable(team.status)
  const room = team.memberIds.length < groupSize
  const working = busy !== null
  return <SectionCard title={team.name} description={teamHint(team, groupSize)} icon={<Users size={20} />}
    action={<div className="flex flex-wrap items-center gap-2"><Badge>{teamStatusLabel(team.status)}</Badge>{team.code && <Badge>Code {team.code}</Badge>}
      <Button type="button" variant="secondary" disabled={!editable || working} onClick={onDelete} aria-label={`Delete ${team.name}`}><Trash2 size={16} aria-hidden="true" /> Delete</Button></div>}>
    <ul className="m-0 grid list-none gap-2 p-0" aria-label={`Members of ${team.name}`}>
      {team.memberIds.map(id => {
        const isRep = id === team.representativeId
        const name = memberLabel(id, team.memberNames, roster)
        return <li key={id} className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2"><strong>{name}</strong>{isRep && <Badge className="inline-flex items-center gap-1"><Crown size={12} aria-hidden="true" /> Representative</Badge>}</span>
          {editable && <span className="flex flex-wrap gap-2">
            {!isRep && <Button type="button" variant="secondary" disabled={working} onClick={() => void onRepresentative(id)} aria-label={`Make ${name} the representative`}><Crown size={16} aria-hidden="true" /> Make representative</Button>}
            <Button type="button" variant="secondary" disabled={working} onClick={() => void onRemove(id)} aria-label={`Remove ${name} from ${team.name}`}><UserMinus size={16} aria-hidden="true" /> Remove</Button>
          </span>}
        </li>
      })}
    </ul>
    {editable && room && waiting.length > 0 && <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
      <Select label={`Add a student to ${team.name}`} name={`add-${team.id}`} value={toAdd} onChange={event => setToAdd(event.target.value)}
        options={[{ value: '', label: 'Choose a student…' }, ...waiting.map(student => ({ value: student.uid, label: student.name }))]} />
      <Button type="button" variant="secondary" disabled={!toAdd || working} onClick={() => { const id = toAdd; setToAdd(''); void onAdd(id) }}><UserPlus size={16} aria-hidden="true" /> Add member</Button>
    </div>}
  </SectionCard>
}

interface NewTeamDialogProps { students: RosterStudent[]; groupSize: number; teams: Team[]; busy: boolean; onClose: () => void; onCreate: (draft: TeamDraft) => void }

function NewTeamDialog({ students, groupSize, teams, busy, onClose, onCreate }: NewTeamDialogProps) {
  const [name, setName] = useState(`Team ${teams.length + 1}`)
  const [selected, setSelected] = useState<string[]>([])
  const [representative, setRepresentative] = useState('')
  const rep = selected.includes(representative) ? representative : (selected[0] ?? '')
  const draft: TeamDraft = { name, memberIds: selected, representativeId: rep }
  const problem = validateTeamDraft(draft, groupSize)
  const duplicate = isDuplicateTeamName(name, teams)
  const full = selected.length >= groupSize
  const toggle = (uid: string) => setSelected(current => current.includes(uid) ? current.filter(id => id !== uid) : [...current, uid])
  return <Dialog open onClose={onClose} title="New team" description={`Choose up to ${groupSize} students. They will see this team when they open the quiz.`}>
    <div className="grid gap-4">
      <Input label="Team name" name="team-name" value={name} maxLength={TEAM_NAME_MAX} onChange={event => setName(event.target.value)} hint={duplicate ? 'Another team already has this name.' : `Up to ${TEAM_NAME_MAX} characters.`} />
      <fieldset className="m-0 grid gap-2 border-0 p-0"><legend className="field__label">Students ({selected.length} of {groupSize})</legend>
        {students.map(student => <Checkbox key={student.uid} name={`member-${student.uid}`} label={student.name} checked={selected.includes(student.uid)} disabled={!selected.includes(student.uid) && full} onChange={() => toggle(student.uid)} />)}
      </fieldset>
      <Select label="Representative" name="team-representative" value={rep} onChange={event => setRepresentative(event.target.value)}
        options={selected.length === 0 ? [{ value: '', label: 'Pick students first' }] : selected.map(uid => ({ value: uid, label: students.find(student => student.uid === uid)?.name ?? uid }))}
        hint="The representative submits the answers when the quiz uses representative mode." />
      {selected.length > 0 && problem && <Alert tone="warning" label="Not ready yet">{problem}</Alert>}
    </div>
    <div className="dialog__actions">
      <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
      <Button type="button" disabled={problem !== null || busy} onClick={() => onCreate({ ...draft, name: name.trim() })}>{busy ? 'Creating…' : 'Create team'}</Button>
    </div>
  </Dialog>
}

interface AutoAssignDialogProps { students: RosterStudent[]; groupSize: number; teams: Team[]; busy: boolean; onClose: () => void; onCreate: (drafts: TeamDraft[]) => void }

function AutoAssignDialog({ students, groupSize, teams, busy, onClose, onCreate }: AutoAssignDialogProps) {
  const make = useCallback(() => autoAssignDrafts(students, groupSize, teams), [students, groupSize, teams])
  const [drafts, setDrafts] = useState<TeamDraft[]>(make)
  const shown = drafts.slice(0, AUTO_ASSIGN_PER_RUN)
  const leftOut = drafts.slice(AUTO_ASSIGN_PER_RUN).reduce((sum, draft) => sum + draft.memberIds.length, 0)
  const nameOf = (uid: string) => students.find(student => student.uid === uid)?.name ?? uid
  return <Dialog open onClose={onClose} title="Auto-assign teams" description={`${students.length} students without a team will be split into ${drafts.length} balanced ${drafts.length === 1 ? 'team' : 'teams'} of up to ${groupSize}.`} className="dialog--wide">
    <div className="grid gap-4">
      {leftOut > 0 && <Alert tone="info" label="Done in rounds">To stay within the server’s limit, this round creates the first {AUTO_ASSIGN_PER_RUN} teams. {leftOut} students stay unassigned; run Auto-assign again in a few minutes.</Alert>}
      <ol className="m-0 grid list-none gap-2 p-0" aria-label="Preview of teams">{shown.map(draft => <li key={draft.name} className="section-card"><strong>{draft.name}</strong><p className="m-0">{draft.memberIds.map(nameOf).join(', ')}</p></li>)}</ol>
    </div>
    <div className="dialog__actions">
      <Button type="button" variant="secondary" disabled={busy} onClick={() => setDrafts(make())}><Shuffle size={16} aria-hidden="true" /> Shuffle again</Button>
      <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
      <Button type="button" disabled={busy || shown.length === 0} onClick={() => onCreate(shown)}>{busy ? 'Creating teams…' : `Create ${shown.length} ${shown.length === 1 ? 'team' : 'teams'}`}</Button>
    </div>
  </Dialog>
}
