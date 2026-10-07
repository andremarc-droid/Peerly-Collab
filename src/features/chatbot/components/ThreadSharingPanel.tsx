import { useEffect, useState } from 'react'
import { Activity, Copy, Link2, Users, UserRoundPlus, X } from 'lucide-react'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { buildTutorInviteUrl, createTutorInvite, removeTutorMember, setTutorInviteActive, setTutorMemberRole, watchTutorActivity, watchTutorInvites, watchTutorMembers, writeActivity } from '../sharedAccessService'
import { watchTutorPresence, writeTutorPresence, type TutorPresence } from '../sharedPresence'
import type { TutorActivity, TutorShareInvite, TutorShareMember } from '../sharedTypes'
import type { ChatThread } from '../types'

interface ThreadSharingPanelProps {
  thread: ChatThread
  uid: string
  displayName: string
  onShare: (thread: ChatThread) => Promise<void>
  error?: string | null
  onClearError?: () => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The sharing action failed.'
}

export function ThreadSharingPanel({
  thread,
  uid,
  displayName,
  onShare,
  error,
  onClearError,
}: ThreadSharingPanelProps) {
  const role = thread.sharedRole
  const owner = role === 'owner'
  const [members, setMembers] = useState<TutorShareMember[]>([])
  const [invites, setInvites] = useState<TutorShareInvite[]>([])
  const [activity, setActivity] = useState<TutorActivity[]>([])
  const [presence, setPresence] = useState<TutorPresence[]>([])
  const [inviteRole, setInviteRole] = useState<'viewer' | 'editor'>('viewer')
  const [expiry, setExpiry] = useState('7')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [copyValue, setCopyValue] = useState<string | null>(null)

  useEffect(() => {
    if (!role) return
    const unsubs = [
      watchTutorActivity(thread.id, setActivity, (cause) => setActionError(cause.message)),
      watchTutorPresence(thread.id, setPresence, (cause) => setActionError(cause.message)),
    ]
    if (owner) {
      unsubs.push(
        watchTutorMembers(thread.id, setMembers, (cause) => setActionError(cause.message)),
        watchTutorInvites(thread.id, setInvites, (cause) => setActionError(cause.message)),
      )
    }
    const heartbeat = () => {
      void writeTutorPresence(thread.id, uid, displayName, document.visibilityState === 'visible')
        .catch((cause: unknown) => setActionError(errorMessage(cause)))
    }
    heartbeat()
    const timer = window.setInterval(heartbeat, 30_000)
    document.addEventListener('visibilitychange', heartbeat)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', heartbeat)
      void writeTutorPresence(thread.id, uid, displayName, false).catch(() => undefined)
      unsubs.forEach((unsubscribe) => unsubscribe())
    }
  }, [displayName, owner, role, thread.id, uid])

  const copy = async (text: string) => {
    setCopyValue(text)
    try {
      await navigator.clipboard.writeText(text)
      setCopyError(null)
    } catch {
      setCopyError('Clipboard access failed. Copy the invite link from your browser address bar after opening it.')
    }
  }

  const createInvite = async () => {
    setBusy(true)
    setActionError(null)
    try {
      const token = await createTutorInvite(thread.id, uid, inviteRole, expiry === 'never' ? null : Number(expiry))
      const url = buildTutorInviteUrl(window.location.origin, thread.id, token)
      await writeActivity(thread.id, uid, displayName, `Created a ${inviteRole === 'editor' ? 'can edit' : 'view only'} invite.`)
      await copy(url)
    } catch (cause) {
      setActionError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const changeRole = async (member: TutorShareMember, nextRole: 'viewer' | 'editor') => {
    try {
      await setTutorMemberRole(thread.id, member.uid, nextRole)
      await writeActivity(thread.id, uid, displayName, `Changed ${member.displayName}'s access to ${nextRole}.`)
    } catch (cause) {
      setActionError(errorMessage(cause))
    }
  }

  const removeMember = async (member: TutorShareMember) => {
    try {
      await removeTutorMember(thread.id, uid, member.uid)
      await writeActivity(thread.id, uid, displayName, `Removed ${member.displayName}'s access.`)
    } catch (cause) {
      setActionError(errorMessage(cause))
    }
  }

  const toggleInvite = async (invite: TutorShareInvite) => {
    try {
      await setTutorInviteActive(thread.id, invite.token, !invite.active)
      if (invite.active) await writeActivity(thread.id, uid, displayName, 'Turned off an invite link.')
    } catch (cause) {
      setActionError(errorMessage(cause))
    }
  }

  return (
    <section className="grid gap-4 border-t border-navy-900-12 px-4 py-3" aria-label="Conversation sharing">
      {!role ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 text-sm text-navy-800">This conversation is private and saved on this device.</p>
          <Button type="button" variant="secondary" disabled={busy || thread.messages.length === 0} onClick={() => {
            setBusy(true)
            setActionError(null)
            void onShare(thread).catch((cause: unknown) => setActionError(errorMessage(cause))).finally(() => setBusy(false))
          }}>
            <Link2 size={16} aria-hidden="true" />
            <span>{busy ? 'Sharing…' : 'Share conversation'}</span>
          </Button>
        </div>
      ) : (
        <>
          <p className="m-0 text-sm font-semibold text-navy-900">
            Shared conversation · {owner ? 'Owner' : role === 'editor' ? 'Can edit' : 'View only'}
            {!owner && <span className="font-normal">. Shared messages and images are stored securely in Peerly.</span>}
          </p>
          {owner && (
            <div className="grid gap-3">
              <h3 className="m-0 flex items-center gap-2 font-bold text-navy-900">
                <UserRoundPlus size={17} aria-hidden="true" /> Invite people
              </h3>
              <div className="flex flex-wrap items-end gap-3">
                <label className="grid gap-1 text-sm font-semibold text-navy-900">
                  Access
                  <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as 'viewer' | 'editor')} className="min-h-11 rounded-xl border border-navy-900-30 bg-white px-3 text-navy-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-800">
                    <option value="viewer">View only</option>
                    <option value="editor">Can edit</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-semibold text-navy-900">
                  Link expires
                  <select value={expiry} onChange={(event) => setExpiry(event.target.value)} className="min-h-11 rounded-xl border border-navy-900-30 bg-white px-3 text-navy-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-800">
                    <option value="7">In 7 days</option>
                    <option value="30">In 30 days</option>
                    <option value="never">Never</option>
                  </select>
                </label>
                <Button type="button" variant="primary" disabled={busy} onClick={() => void createInvite()}>
                  <Link2 size={16} aria-hidden="true" /><span>{busy ? 'Creating…' : 'Create invite link'}</span>
                </Button>
              </div>
              {invites.length > 0 && (
                <ul className="m-0 grid list-none gap-2 p-0">
                  {invites.map((invite) => {
                    const url = buildTutorInviteUrl(window.location.origin, thread.id, invite.token)
                    return (
                      <li key={invite.token} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-navy-900-12 p-3">
                        <span className="text-sm text-navy-900">
                          {invite.role === 'editor' ? 'Can edit' : 'View only'} · {invite.active ? 'Active' : 'Off'}
                          {invite.expiresAtMs ? ` · Expires ${new Date(invite.expiresAtMs).toLocaleDateString()}` : ''}
                        </span>
                        <div className="flex gap-2">
                          <Button type="button" variant="secondary" onClick={() => void copy(url)}><Copy size={15} aria-hidden="true" /><span>Copy</span></Button>
                          <Button type="button" variant="secondary" onClick={() => void toggleInvite(invite)}>{invite.active ? 'Turn off' : 'Turn on'}</Button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          {owner && members.length > 0 && (
            <div className="grid gap-2">
              <h3 className="m-0 flex items-center gap-2 font-bold text-navy-900"><Users size={17} aria-hidden="true" /> People</h3>
              <ul className="m-0 grid list-none gap-2 p-0">
                {members.map((member) => (
                  <li key={member.uid} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-navy-900-12 p-3">
                    <span className="font-semibold text-navy-900">{member.displayName}</span>
                    <div className="flex items-center gap-2">
                      <label htmlFor={`tutor-role-${member.uid}`} className="sr-only">Access for {member.displayName}</label>
                      <select id={`tutor-role-${member.uid}`} value={member.role} onChange={(event) => void changeRole(member, event.target.value as 'viewer' | 'editor')} className="min-h-11 rounded-xl border border-navy-900-30 bg-white px-3 text-sm text-navy-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-800">
                        <option value="viewer">View only</option>
                        <option value="editor">Can edit</option>
                      </select>
                      <Button type="button" variant="secondary" aria-label={`Remove ${member.displayName}`} onClick={() => void removeMember(member)}><X size={16} aria-hidden="true" /></Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <h3 className="m-0 flex items-center gap-2 font-bold text-navy-900"><Users size={17} aria-hidden="true" /> Presence</h3>
              <p className="m-0 text-sm text-navy-800">{presence.length === 0 ? 'No one is here right now.' : presence.map((person) => `${person.name}${person.online ? ' · Active' : ' · Offline'}`).join(' · ')}</p>
            </div>
            <div className="grid gap-2">
              <h3 className="m-0 flex items-center gap-2 font-bold text-navy-900"><Activity size={17} aria-hidden="true" /> Recent activity</h3>
              <ul className="m-0 grid list-none gap-1 p-0 text-sm text-navy-800">
                {activity.slice(0, 5).map((item) => <li key={item.id}>{item.actorName}: {item.summary}</li>)}
                {activity.length === 0 && <li>No activity yet.</li>}
              </ul>
            </div>
          </div>
              {copyError && copyValue && <p className="m-0 break-all rounded-xl border border-navy-900-12 bg-white p-3 text-sm text-navy-900" aria-label="Invite URL">{copyValue}</p>}
            </>
      )}
      {(error || actionError || copyError) && (
        <Alert tone="error" label="Sharing issue" action={onClearError ? <Button type="button" variant="secondary" onClick={() => { onClearError(); setActionError(null); setCopyError(null) }}>Dismiss</Button> : undefined}>
          {actionError ?? copyError ?? error}
        </Alert>
      )}
    </section>
  )
}
