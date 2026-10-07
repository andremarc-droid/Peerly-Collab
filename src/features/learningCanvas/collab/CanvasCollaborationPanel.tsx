import { useEffect, useState } from 'react'
import { Activity, Copy, Link2, UserRound, UserRoundPlus, X } from 'lucide-react'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { INVITE_EXPIRY_OPTIONS, MAX_CANVAS_MEMBERS } from './constants'
import { memberSummary } from './activity'
import { buildInviteUrl, inviteStatus } from './inviteLink'
import { createInvite, deleteInvite, setInviteActive } from './inviteService'
import { logActivity } from './activityService'
import { removeMember, setMemberRole } from './memberService'
import { ACCESS_LABEL } from './access'
import type { CollabPerson, CollabRole, InviteView, MemberView, ActivityRecord } from './types'

interface CanvasCollaborationPanelProps {
  classId: string
  canvasId: string
  uid: string
  name: string
  owner: boolean
  people: CollabPerson[]
  members: MemberView[]
  invites: InviteView[]
  activity: ActivityRecord[]
  error: string | null
}

function formatTime(timeMs: number | null): string {
  return timeMs === null ? 'Just now' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timeMs)
}

export function CanvasCollaborationPanel({
  classId,
  canvasId,
  uid,
  name,
  owner,
  people,
  members,
  invites,
  activity,
  error,
}: CanvasCollaborationPanelProps) {
  const [role, setRole] = useState<CollabRole>('viewer')
  const [expiry, setExpiry] = useState<(typeof INVITE_EXPIRY_OPTIONS)[number]['value']>('7')
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const atMemberLimit = members.length >= MAX_CANVAS_MEMBERS

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setActionError(null)
    } catch {
      setActionError('Could not copy to clipboard. Select and copy the invite link instead.')
    }
  }

  const create = async () => {
    setBusy(true)
    setActionError(null)
    try {
      const token = await createInvite(classId, canvasId, uid, role, expiry)
      const url = buildInviteUrl(window.location.origin, classId, canvasId, token)
      setInviteUrl(url)
      await logActivity(classId, canvasId, { uid, name }, {
        type: 'member',
        summary: `Created an invite link (${role === 'editor' ? 'can edit' : 'view only'})`,
      })
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not create an invite link.')
    } finally {
      setBusy(false)
    }
  }

  const updateMemberRole = async (member: MemberView, nextRole: CollabRole) => {
    setActionError(null)
    try {
      await setMemberRole(classId, canvasId, member.uid, nextRole)
      await logActivity(classId, canvasId, { uid, name }, {
        type: 'member',
        summary: memberSummary.roleChanged(member.displayName, nextRole),
      })
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not update access.')
    }
  }

  const remove = async (member: MemberView) => {
    setActionError(null)
    try {
      await removeMember(classId, canvasId, member.uid)
      await logActivity(classId, canvasId, { uid, name }, {
        type: 'member',
        summary: memberSummary.removed(member.displayName),
      })
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not remove this person.')
    }
  }

  const toggleInvite = async (invite: InviteView, active: boolean) => {
    setActionError(null)
    try {
      await setInviteActive(classId, canvasId, invite.token, active)
      if (!active) {
        await logActivity(classId, canvasId, { uid, name }, { type: 'member', summary: memberSummary.inviteRevoked() })
      }
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not update this invite.')
    }
  }

  const revokeInvite = async (invite: InviteView) => {
    setActionError(null)
    try {
      await deleteInvite(classId, canvasId, invite.token)
      await logActivity(classId, canvasId, { uid, name }, { type: 'member', summary: memberSummary.inviteRevoked() })
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not remove this invite.')
    }
  }

  return (
    <section className="grid gap-5 rounded-2xl border border-navy-900-12 bg-white p-4 shadow-sm" aria-label="Canvas collaboration">
      <div className="grid gap-3">
        <h2 className="m-0 flex items-center gap-2 text-lg font-bold text-navy-900">
          <UserRound size={18} aria-hidden="true" /> People
        </h2>
        <ul className="m-0 grid list-none gap-2 p-0">
          {people.map((person) => {
            const member = members.find((candidate) => candidate.uid === person.uid)
            return (
              <li key={person.uid} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-navy-900-12 p-3">
                <div className="min-w-0">
                  <p className="m-0 truncate font-semibold text-navy-900">
                    {person.name}{person.isYou ? ' (you)' : ''}
                  </p>
                  <p className="m-0 text-sm text-navy-800">
                    {person.access === 'owner' ? ACCESS_LABEL.owner : ACCESS_LABEL[person.access]}
                    {' · '}{person.state === 'active' ? 'Active' : 'Offline'}
                    {' · '}{person.lastSeenLabel}
                  </p>
                </div>
                {owner && member && (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`member-role-${member.uid}`}>Access for {member.displayName}</label>
                    <select
                      id={`member-role-${member.uid}`}
                      className="min-h-11 rounded-xl border border-navy-900-30 bg-white px-3 text-sm text-navy-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-800"
                      value={member.role}
                      onChange={(event) => void updateMemberRole(member, event.target.value as CollabRole)}
                    >
                      <option value="viewer">View only</option>
                      <option value="editor">Can edit</option>
                    </select>
                    <Button variant="ghost" aria-label={`Remove ${member.displayName}`} onClick={() => void remove(member)}>
                      <X size={16} aria-hidden="true" />
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      {owner && (
        <div className="grid gap-3 border-t border-navy-900-12 pt-4">
          <h2 className="m-0 flex items-center gap-2 text-lg font-bold text-navy-900">
            <UserRoundPlus size={18} aria-hidden="true" /> Invite people
          </h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm font-semibold text-navy-900">
              Access
              <select
                className="min-h-11 rounded-xl border border-navy-900-30 bg-white px-3 text-sm text-navy-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-800"
                value={role}
                onChange={(event) => setRole(event.target.value as CollabRole)}
              >
                <option value="viewer">View only</option>
                <option value="editor">Can edit</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold text-navy-900">
              Link expires
              <select
                className="min-h-11 rounded-xl border border-navy-900-30 bg-white px-3 text-sm text-navy-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-800"
                value={expiry}
                onChange={(event) => setExpiry(event.target.value as typeof expiry)}
              >
                {INVITE_EXPIRY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <Button variant="primary" disabled={busy || atMemberLimit} onClick={() => void create()}>
              <Link2 size={16} aria-hidden="true" /><span>{busy ? 'Creating…' : 'Create invite link'}</span>
            </Button>
          </div>
          {atMemberLimit && (
            <p className="m-0 text-sm text-navy-800">
              This canvas has reached the {MAX_CANVAS_MEMBERS}-person sharing limit. Remove a person before inviting someone else.
            </p>
          )}
          {inviteUrl && (
            <div className="grid gap-2 rounded-xl border border-navy-900-12 bg-navy-900-05 p-3">
              <label className="text-sm font-semibold text-navy-900" htmlFor="new-canvas-invite">Invite link</label>
              <input id="new-canvas-invite" readOnly value={inviteUrl} className="min-h-11 min-w-0 rounded-lg border border-navy-900-30 bg-white px-3 text-sm text-navy-900" onFocus={(event) => event.currentTarget.select()} />
              <Button variant="secondary" onClick={() => void copy(inviteUrl)}>
                <Copy size={16} aria-hidden="true" /><span>Copy invite link</span>
              </Button>
            </div>
          )}
          {invites.length > 0 && (
            <ul className="m-0 grid list-none gap-2 p-0">
              {invites.map((invite) => {
                const status = inviteStatus(invite, nowMs)
                return (
                <li key={invite.token} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-navy-900-12 p-3">
                  <span className="text-sm text-navy-900">
                    {ACCESS_LABEL[invite.role]} · {status === 'active' ? 'Active link' : status === 'expired' ? 'Expired link' : 'Turned off'}
                    {invite.expiresAtMs ? ` · Expires ${formatTime(invite.expiresAtMs)}` : ' · No expiry'}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {status === 'active' && (
                      <>
                        <Button variant="secondary" onClick={() => void copy(buildInviteUrl(window.location.origin, classId, canvasId, invite.token))}>
                          <Copy size={16} aria-hidden="true" /><span>Copy</span>
                        </Button>
                        <Button variant="secondary" onClick={() => void toggleInvite(invite, false)}>Turn off</Button>
                      </>
                    )}
                    <Button variant="ghost" onClick={() => void revokeInvite(invite)} aria-label="Delete invite link"><X size={16} aria-hidden="true" /></Button>
                  </div>
                </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      <div className="grid gap-3 border-t border-navy-900-12 pt-4">
        <h2 className="m-0 flex items-center gap-2 text-lg font-bold text-navy-900">
          <Activity size={18} aria-hidden="true" /> Activity
        </h2>
        {activity.length === 0 ? (
          <p className="m-0 text-sm text-navy-800">Changes and invitations will appear here.</p>
        ) : (
          <ol className="m-0 grid list-none gap-3 p-0">
            {activity.map((entry) => (
              <li key={entry.id} className="border-l-2 border-navy-800 pl-3">
                <p className="m-0 font-semibold text-navy-900">{entry.actorName}: {entry.summary}</p>
                <time className="text-sm text-navy-800" dateTime={entry.createdAtMs === null ? undefined : new Date(entry.createdAtMs).toISOString()}>{formatTime(entry.createdAtMs)}</time>
                {entry.changes.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-sm text-navy-800">
                    {entry.changes.map((line, index) => <li key={`${entry.id}-${index}`}>{line}</li>)}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
      {(error || actionError) && (
        <Alert tone="error" label="Collaboration update failed">{actionError || error}</Alert>
      )}
    </section>
  )
}
