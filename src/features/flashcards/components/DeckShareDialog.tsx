import { useEffect, useState } from 'react'
import { Activity, Copy, Link2, UserRound, X } from 'lucide-react'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { Dialog } from '../../../shared/ui/Dialog'
import { INVITE_EXPIRY_OPTIONS } from '../../learningCanvas/collab/constants'
import { inviteStatus } from '../../learningCanvas/collab/inviteLink'
import {
  changeDeckInvite,
  changeDeckMemberRole,
  createDeckInvite,
  deleteDeckInvite,
  logDeckActivity,
  removeDeckMember,
  watchDeckActivity,
  watchDeckInvites,
  watchDeckMembers,
  watchDeckPresence,
  type DeckActivity,
  type DeckInvite,
  type DeckMember,
} from '../sharing'

interface DeckShareDialogProps {
  classId: string
  deckId: string
  deckTitle: string
  ownerId: string
  uid: string
  name: string
  owner: boolean
  onClose: () => void
}

function formatTime(timeMs: number | null): string {
  return timeMs === null ? 'Just now' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timeMs)
}

export function DeckShareDialog({ classId, deckId, deckTitle, ownerId, uid, name, owner, onClose }: DeckShareDialogProps) {
  const [role, setRole] = useState<'viewer' | 'editor'>('viewer')
  const [expiry, setExpiry] = useState<(typeof INVITE_EXPIRY_OPTIONS)[number]['value']>('7')
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [members, setMembers] = useState<DeckMember[]>([])
  const [invites, setInvites] = useState<DeckInvite[]>([])
  const [presence, setPresence] = useState<Map<string, number>>(new Map())
  const [activity, setActivity] = useState<DeckActivity[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const fail = (cause: Error) => setError(cause.message)
    const unsubscribers = [
      watchDeckMembers(classId, deckId, setMembers, fail),
      watchDeckPresence(classId, deckId, setPresence, fail),
      watchDeckActivity(classId, deckId, setActivity, fail),
    ]
    if (owner) unsubscribers.push(watchDeckInvites(classId, deckId, setInvites, fail))
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  }, [classId, deckId, owner])

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [])

  const record = async (summary: string) => logDeckActivity(classId, deckId, { uid, name }, summary, 'member')
  const recordAfterAction = async (summary: string) => {
    try {
      await record(summary)
    } catch {
      setError('The action succeeded, but its activity could not be recorded.')
    }
  }
  const create = async () => {
    setBusy(true)
    setError(null)
    setInviteUrl(null)
    let created = false
    try {
      const token = await createDeckInvite(classId, deckId, uid, role, expiry)
      const url = `${window.location.origin}/learning/join/deck/${encodeURIComponent(classId)}/${encodeURIComponent(deckId)}/${encodeURIComponent(token)}`
      setInviteUrl(url)
      created = true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create an invite link.')
    } finally {
      setBusy(false)
    }
    if (created) {
      await recordAfterAction(`Created an invite link (${role === 'editor' ? 'can edit' : 'view only'})`)
    }
  }
  const copy = async () => {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
    } catch {
      setError('Could not copy. Select and copy the invite link instead.')
    }
  }
  const editRole = async (member: DeckMember, nextRole: 'viewer' | 'editor') => {
    try {
      await changeDeckMemberRole(classId, deckId, member.uid, nextRole)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update access.')
      return
    }
    await recordAfterAction(`Changed ${member.name}'s access to ${nextRole === 'editor' ? 'can edit' : 'view only'}`)
  }
  const remove = async (member: DeckMember) => {
    try {
      await removeDeckMember(classId, deckId, member.uid)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove this person.')
      return
    }
    await recordAfterAction(`Removed ${member.name} from this deck`)
  }
  const toggleInvite = async (invite: DeckInvite, active: boolean) => {
    try {
      await changeDeckInvite(classId, deckId, invite.token, active)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update invite.')
      return
    }
    await recordAfterAction(active ? 'Re-enabled an invite link' : 'Turned off an invite link')
  }
  const removeInvite = async (invite: DeckInvite) => {
    try {
      await deleteDeckInvite(classId, deckId, invite.token)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove invite.')
      return
    }
    await recordAfterAction('Removed an invite link')
  }

  return (
    <Dialog open onClose={onClose} title={`Share “${deckTitle}”`} description="Invite people to this deck only. They must be active members of this class to join.">
      <div className="grid gap-5">
        {error && <Alert tone="error" label="Sharing action failed">{error}</Alert>}
        <section className="grid gap-3" aria-label="Deck collaborators">
          <h3 className="m-0 flex items-center gap-2 font-bold text-navy-900"><UserRound size={18} aria-hidden="true" /> People</h3>
          <ul className="m-0 grid list-none gap-2 p-0">
            <li className="rounded-xl border border-navy-900-12 p-3">
              <p className="m-0 font-semibold text-navy-900">{owner ? `${name} (owner)` : 'Deck owner'}</p>
              <p className="m-0 text-sm text-navy-800">Owner · {presence.has(ownerId) && nowMs - (presence.get(ownerId) ?? 0) < 45_000 ? 'Active' : 'Offline'}</p>
            </li>
            {members.map((member) => {
              const lastActive = presence.get(member.uid)
              const online = lastActive !== undefined && nowMs - lastActive < 45_000
              return (
                <li key={member.uid} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-navy-900-12 p-3">
                  <div>
                    <p className="m-0 font-semibold text-navy-900">{member.name}{member.uid === uid ? ' (you)' : ''}</p>
                    <p className="m-0 text-sm text-navy-800">{member.role === 'editor' ? 'Can edit' : 'View only'} · {online ? 'Active' : 'Offline'}</p>
                  </div>
                  {owner && member.uid !== uid && (
                    <div className="flex items-center gap-2">
                      <label className="sr-only" htmlFor={`deck-member-${member.uid}`}>Access for {member.name}</label>
                      <select id={`deck-member-${member.uid}`} value={member.role} onChange={(event) => void editRole(member, event.target.value as 'viewer' | 'editor')} className="min-h-11 rounded-xl border border-navy-900-30 bg-white px-3 text-sm text-navy-900">
                        <option value="viewer">View only</option><option value="editor">Can edit</option>
                      </select>
                      <Button variant="ghost" aria-label={`Remove ${member.name}`} onClick={() => void remove(member)}><X size={16} aria-hidden="true" /></Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>

        {owner && (
          <section className="grid gap-3 border-t border-navy-900-12 pt-4">
            <h3 className="m-0 flex items-center gap-2 font-bold text-navy-900"><Link2 size={18} aria-hidden="true" /> Invite link</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold text-navy-900">Access
                <select value={role} onChange={(event) => setRole(event.target.value as 'viewer' | 'editor')} className="min-h-11 rounded-xl border border-navy-900-30 bg-white px-3">
                  <option value="viewer">View only</option><option value="editor">Can edit</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm font-semibold text-navy-900">Expires
                <select value={expiry} onChange={(event) => setExpiry(event.target.value as typeof expiry)} className="min-h-11 rounded-xl border border-navy-900-30 bg-white px-3">
                  {INVITE_EXPIRY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>
            <Button variant="primary" disabled={busy} onClick={() => void create()}>{busy ? 'Creating…' : 'Create invite link'}</Button>
            {inviteUrl && (
              <div className="grid gap-2 rounded-xl border border-navy-900-12 bg-navy-900-05 p-3">
                <label className="grid gap-1 text-sm font-semibold text-navy-900">Invite link<input readOnly value={inviteUrl} className="min-h-11 min-w-0 rounded-xl border border-navy-900-30 bg-white px-3 font-normal" /></label>
                <Button variant="secondary" onClick={() => void copy()}><Copy size={16} aria-hidden="true" /> Copy link</Button>
              </div>
            )}
            <ul className="m-0 grid list-none gap-2 p-0">
              {invites.map((invite) => {
                const state = inviteStatus(invite, nowMs)
                return <li key={invite.token} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-navy-900-12 p-3">
                  <span className="text-sm text-navy-900">{invite.role === 'editor' ? 'Can edit' : 'View only'} · {state}</span>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => void toggleInvite(invite, !invite.active)}>{invite.active ? 'Turn off' : 'Turn on'}</Button>
                    <Button variant="ghost" aria-label="Delete invite link" onClick={() => void removeInvite(invite)}><X size={16} aria-hidden="true" /></Button>
                  </div>
                </li>
              })}
            </ul>
          </section>
        )}

        <section className="grid gap-3 border-t border-navy-900-12 pt-4">
          <h3 className="m-0 flex items-center gap-2 font-bold text-navy-900"><Activity size={18} aria-hidden="true" /> Activity</h3>
          {activity.length === 0 ? <p className="m-0 text-sm text-navy-800">Changes and sharing events will appear here.</p> : (
            <ol className="m-0 grid list-none gap-2 p-0">
              {activity.map((item) => <li key={item.id} className="rounded-xl border border-navy-900-12 p-3"><p className="m-0 font-semibold text-navy-900">{item.actorName}{item.type === 'member' ? ' · Sharing' : ' · Edit'}</p><p className="m-0 text-sm text-navy-800">{item.summary} · {formatTime(item.createdAtMs)}</p></li>)}
            </ol>
          )}
        </section>
      </div>
    </Dialog>
  )
}
