import { useState } from 'react'
import { ArrowLeft, Lock, UserPlus, Users } from 'lucide-react'
import { Alert } from '../../../shared/ui/Alert'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { Input } from '../../../shared/ui/Input'
import { useToast } from '../../../shared/ui/useToast'
import { joinStudyGroupById, joinStudyGroupWithCode } from '../services'
import type { StudyGroup } from '../types'

interface StudyGroupPreviewProps {
  group: StudyGroup | null
  groupId: string
  onJoined: () => void
  onBack: () => void
}

export function StudyGroupPreview({ group, groupId, onJoined, onBack }: StudyGroupPreviewProps) {
  const { showToast } = useToast()
  const [inviteCode, setInviteCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const targetId = group?.id || groupId

  const handleJoinPublic = async () => {
    setBusy(true)
    setError(null)
    try {
      await joinStudyGroupById(targetId)
      showToast('success', `Joined ${group?.name || 'group'}!`)
      onJoined()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not join group.'
      setError(msg)
      showToast('error', msg)
    } finally {
      setBusy(false)
    }
  }

  const handleJoinWithCode = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = inviteCode.trim().toUpperCase()
    if (!code) return
    setBusy(true)
    setError(null)
    try {
      const res = await joinStudyGroupWithCode(code)
      showToast('success', `Joined ${res.groupName}!`)
      onJoined()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not join group with code.'
      setError(msg)
      showToast('error', msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6 max-w-2xl mx-auto py-4">
      <div>
        <Button variant="secondary" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" />
          Back to study groups
        </Button>
      </div>

      {error && <Alert tone="error" label="Error">{error}</Alert>}

      {group ? (
        <article className="rounded-3xl border border-navy-900-15 bg-white p-6 shadow-sm grid gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge>{group.privacy === 'public' ? 'Public group' : 'Private group'}</Badge>
            <span className="text-sm text-navy-900-72 flex items-center gap-1.5">
              <Users size={14} aria-hidden="true" />
              {group.memberCount} / {group.maxMembers} members
            </span>
          </div>

          <div className="grid gap-2">
            <h2 className="m-0 text-2xl font-bold text-navy-900">{group.name}</h2>
            {group.description ? (
              <p className="m-0 text-base text-navy-900-72">{group.description}</p>
            ) : (
              <p className="m-0 text-sm italic text-navy-900-72">No description provided.</p>
            )}
          </div>

          <div className="rounded-2xl border border-navy-900-10 bg-navy-900-05 p-4 text-sm text-navy-900 grid gap-1">
            <p className="m-0 font-medium">Join this group to collaborate</p>
            <p className="m-0 text-navy-900-72">
              As a member, you can study shared decks, share your own flashcards, and track progress together.
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="primary" onClick={() => void handleJoinPublic()} disabled={busy}>
              <UserPlus size={16} aria-hidden="true" />
              {busy ? 'Joining…' : 'Join study group'}
            </Button>
          </div>
        </article>
      ) : (
        <article className="rounded-3xl border border-navy-900-15 bg-white p-6 shadow-sm grid gap-5">
          <div className="flex items-center gap-2">
            <Badge>
              <Lock size={12} className="mr-1 inline" aria-hidden="true" />
              Private group
            </Badge>
          </div>

          <div className="grid gap-1">
            <h2 className="m-0 text-2xl font-bold text-navy-900">Private Study Group</h2>
            <p className="m-0 text-sm text-navy-900-72">
              This group is private. Enter the 6-character invite code provided by the group creator to join.
            </p>
          </div>

          <form onSubmit={(e) => void handleJoinWithCode(e)} className="grid gap-4">
            <Input
              label="Invite code"
              name="invite-code"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="e.g. BIO101"
              maxLength={8}
              required
            />
            <div className="flex justify-end">
              <Button type="submit" variant="primary" disabled={busy || !inviteCode.trim()}>
                <UserPlus size={16} aria-hidden="true" />
                {busy ? 'Joining…' : 'Join private group'}
              </Button>
            </div>
          </form>
        </article>
      )}
    </div>
  )
}
