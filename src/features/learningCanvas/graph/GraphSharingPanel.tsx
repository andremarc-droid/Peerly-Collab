import { useEffect, useState } from 'react'
import { Activity, Copy, Link2, UserRound, UserRoundPlus } from 'lucide-react'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import type { ActivityRecord, CollabRole, InviteView, MemberView } from '../collab/types'
import {
  changeGraphMemberRole,
  createGraphInvite,
  logGraphActivity,
  removeGraphMember,
  updateGraphInvite,
  watchGraphActivity,
  watchGraphInvites,
  watchGraphMembers,
  watchGraphPresence,
  writeGraphPresence,
  type GraphPresence,
} from './sharing'

interface GraphSharingPanelProps {
  classId: string
  graphId: string
  uid: string
  name: string
  ownerId: string
  ownerName: string
  owner: boolean
}

function formatTime(value: number | null): string {
  return value === null
    ? 'Just now'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(value)
}

export function GraphSharingPanel({ classId, graphId, uid, name, ownerId, ownerName, owner }: GraphSharingPanelProps) {
  const [members, setMembers] = useState<MemberView[]>([])
  const [invites, setInvites] = useState<InviteView[]>([])
  const [activity, setActivity] = useState<ActivityRecord[]>([])
  const [presence, setPresence] = useState<Map<string, GraphPresence>>(new Map())
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [role, setRole] = useState<CollabRole>('viewer')
  const [expiry, setExpiry] = useState<'7' | '30' | 'never'>('7')
  const [newInviteCode, setNewInviteCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const fail = (cause: Error) => setError(cause.message || 'Could not load graph collaboration.')
    const loaded = () => setError(null)
    const stopMembers = watchGraphMembers(classId, graphId, (items) => { setMembers(items); loaded() }, fail)
    const stopInvites = owner ? watchGraphInvites(classId, graphId, (items) => { setInvites(items); loaded() }, fail) : undefined
    const stopActivity = watchGraphActivity(classId, graphId, (items) => { setActivity(items); loaded() }, fail)
    const stopPresence = watchGraphPresence(classId, graphId, setPresence, fail)
    return () => {
      stopMembers()
      stopInvites?.()
      stopActivity()
      stopPresence()
    }
  }, [classId, graphId, owner])

  useEffect(() => {
    const heartbeat = () => {
      if (document.visibilityState !== 'visible') return
      void writeGraphPresence(classId, graphId, uid, name, true).catch((cause: unknown) => {
        setActionError(cause instanceof Error ? cause.message : 'Could not update presence.')
      })
    }
    heartbeat()
    const timer = window.setInterval(() => {
      setNowMs(Date.now())
      heartbeat()
    }, 20_000)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') heartbeat()
      else void writeGraphPresence(classId, graphId, uid, name, false).catch((cause: unknown) => {
        setActionError(cause instanceof Error ? cause.message : 'Could not update presence.')
      })
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      void writeGraphPresence(classId, graphId, uid, name, false).catch(() => {})
    }
  }, [classId, graphId, uid, name])

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [])

  const record = async (summary: string) => logGraphActivity(
    classId, graphId, { uid, name }, summary, 'member',
  )

  const createInvite = async () => {
    setBusy(true)
    setActionError(null)
    try {
      const code = await createGraphInvite(classId, graphId, uid, role, expiry)
      setNewInviteCode(code)
      await record(`Created a ${role === 'editor' ? 'can edit' : 'view only'} invite code`)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not create this invite code.')
    } finally {
      setBusy(false)
    }
  }

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      setActionError('Copy was unavailable. Select and copy the invite code.')
    }
  }

  const updateRole = async (member: MemberView, nextRole: CollabRole) => {
    try {
      await changeGraphMemberRole(classId, graphId, member.uid, nextRole)
      await record(`Changed ${member.displayName}'s access to ${nextRole === 'editor' ? 'can edit' : 'view only'}`)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not change access.')
    }
  }

  const remove = async (member: MemberView) => {
    try {
      await removeGraphMember(classId, graphId, member.uid)
      await record(`Removed ${member.displayName} from this graph`)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not remove this person.')
    }
  }

  const revoke = async (invite: InviteView) => {
    try {
      await updateGraphInvite(classId, graphId, invite.token, false)
      await record('Turned off a graph invite code')
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not update this invite.')
    }
  }

  return (
    <section className="grid gap-4 rounded-2xl border border-navy-900-12 bg-white p-4 shadow-sm" aria-label="Graph collaborators and activity">
      {error && <Alert tone="error" label="Collaboration unavailable">{error}</Alert>}
      {actionError && <Alert tone="error" label="Sharing action failed">{actionError}</Alert>}
      <div className="grid gap-2">
        <h2 className="m-0 flex items-center gap-2 text-lg font-bold text-navy-900">
          <UserRound size={18} aria-hidden="true" /> Collaborators
        </h2>
        <ul className="m-0 grid list-none gap-2 p-0">
          <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-navy-900-12 p-3">
            <span className="font-semibold text-navy-900">{ownerName}{owner ? ' (you)' : ''} · Owner</span>
            <span className="text-sm text-navy-800">
              Full access · {nowMs - (presence.get(ownerId)?.lastActiveMs ?? 0) < 45_000 ? 'Active' : 'Offline'}
            </span>
          </li>
          {members.map((member) => (
            <li key={member.uid} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-navy-900-12 p-3">
              <div>
                <span className="font-semibold text-navy-900">{member.displayName}{member.uid === uid ? ' (you)' : ''}</span>
                <span className="block text-sm text-navy-800">{nowMs - (presence.get(member.uid)?.lastActiveMs ?? 0) < 45_000 ? 'Active' : 'Offline'}</span>
              </div>
              {owner ? (
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`graph-member-${member.uid}`}>Access for {member.displayName}</label>
                  <select
                    id={`graph-member-${member.uid}`}
                    value={member.role}
                    onChange={(event) => void updateRole(member, event.target.value as CollabRole)}
                    className="min-h-11 rounded-xl border border-navy-900-30 bg-white px-3 text-sm text-navy-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-800"
                  >
                    <option value="viewer">View only</option>
                    <option value="editor">Can edit</option>
                  </select>
                  <Button variant="secondary" onClick={() => void remove(member)} aria-label={`Remove ${member.displayName}`}>Remove</Button>
                </div>
              ) : <span className="text-sm text-navy-800">{member.role === 'editor' ? 'Can edit' : 'View only'}</span>}
            </li>
          ))}
        </ul>
      </div>

      {owner && (
        <div className="grid gap-3 border-t border-navy-900-12 pt-4">
          <h3 className="m-0 flex items-center gap-2 font-bold text-navy-900">
            <UserRoundPlus size={17} aria-hidden="true" /> Invite people with a code
          </h3>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm font-semibold text-navy-900">
              Access
              <select value={role} onChange={(event) => setRole(event.target.value as CollabRole)} className="min-h-11 rounded-xl border border-navy-900-30 bg-white px-3 text-sm">
                <option value="viewer">View only</option>
                <option value="editor">Can edit</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold text-navy-900">
              Code expires
              <select value={expiry} onChange={(event) => setExpiry(event.target.value as typeof expiry)} className="min-h-11 rounded-xl border border-navy-900-30 bg-white px-3 text-sm">
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="never">Never</option>
              </select>
            </label>
            <Button variant="primary" onClick={() => void createInvite()} disabled={busy}>
              <Link2 size={16} aria-hidden="true" /> {busy ? 'Creating…' : 'Create invite code'}
            </Button>
          </div>
          {newInviteCode && (
            <div className="grid gap-2 rounded-xl border border-navy-900-12 bg-navy-900-05 p-3">
              <label htmlFor="graph-invite-code" className="text-sm font-semibold text-navy-900">Invite code</label>
              <input id="graph-invite-code" readOnly value={newInviteCode} onFocus={(event) => event.currentTarget.select()} className="min-h-11 w-full rounded-lg border border-navy-900-30 bg-white px-3 font-mono text-lg tracking-widest text-navy-900" />
              <Button variant="secondary" onClick={() => void copy(newInviteCode)}><Copy size={15} aria-hidden="true" /> Copy code</Button>
            </div>
          )}
          {invites.filter((invite) => invite.active).map((invite) => {
            return (
              <div key={invite.token} className="grid gap-2 rounded-xl border border-navy-900-12 p-3 text-sm text-navy-900">
                <span>{invite.role === 'editor' ? 'Can edit' : 'View only'} invite · {invite.expiresAtMs ? `expires ${formatTime(invite.expiresAtMs)}` : 'no expiry'}</span>
                {invite.code ? (
                  <>
                    <label className="sr-only" htmlFor={`graph-invite-${invite.token}`}>Graph invite code</label>
                    <input id={`graph-invite-${invite.token}`} readOnly value={invite.code} onFocus={(event) => event.currentTarget.select()} className="min-h-11 w-full rounded-lg border border-navy-900-30 bg-white px-3 font-mono text-lg tracking-widest text-navy-900" />
                  </>
                ) : <span className="text-sm text-navy-800">Legacy invite. Create a new code to share this graph.</span>}
                <div className="flex flex-wrap gap-2">
                  {invite.code && <Button variant="secondary" onClick={() => void copy(invite.code)}><Copy size={15} aria-hidden="true" /> Copy code</Button>}
                  <Button variant="secondary" onClick={() => void revoke(invite)}>Turn off</Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="grid gap-2 border-t border-navy-900-12 pt-4">
        <h3 className="m-0 flex items-center gap-2 font-bold text-navy-900"><Activity size={17} aria-hidden="true" /> Activity history</h3>
        {activity.length ? (
          <ol className="m-0 grid list-none gap-2 p-0">
            {activity.map((entry) => (
              <li key={entry.id} className="rounded-xl bg-navy-900-05 px-3 py-2 text-sm text-navy-900">
                <span className="font-semibold">{entry.actorName}</span> {entry.summary}
                <span className="block text-sm text-navy-800">{formatTime(entry.createdAtMs)}</span>
              </li>
            ))}
          </ol>
        ) : <p className="m-0 text-sm text-navy-800">No activity yet.</p>}
      </div>
    </section>
  )
}
