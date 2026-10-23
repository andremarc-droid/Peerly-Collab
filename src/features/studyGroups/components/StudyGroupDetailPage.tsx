import { useEffect, useState } from 'react'
import { ArrowLeft, Copy, Play, Plus, RefreshCw, Trash2, Users } from 'lucide-react'
import { Alert } from '../../../shared/ui/Alert'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { Input } from '../../../shared/ui/Input'
import { Skeleton } from '../../../shared/ui/Skeleton'
import { useToast } from '../../../shared/ui/useToast'
import { useAuth } from '../../auth/useAuth'
import { FlashcardStudyDialog } from '../../flashcards/components/FlashcardStudyDialog'
import type { FlashcardDeckWithId } from '../../flashcards/types'
import {
  deleteStudyGroupCascade,
  getStudyGroup,
  leaveStudyGroupCallable as callLeaveStudyGroup,
  listGroupActivity,
  listGroupMembers,
  listGroupSharedDecks,
  logStudySessionActivity,
  regenerateGroupInviteCode,
  removeStudyGroupMemberCallable as callRemoveMember,
  renameStudyGroup,
  unshareDeckFromGroup,
} from '../services'
import type { SharedGroupDeck, StudyGroup, StudyGroupActivity, StudyGroupMember } from '../types'
import { ShareDeckDialog } from './ShareDeckDialog'

interface Props {
  groupId: string
  onBack: () => void
}

export function StudyGroupDetailPage({ groupId, onBack }: Props) {
  const { user } = useAuth()
  const { showToast } = useToast()

  const [group, setGroup] = useState<StudyGroup | null>(null)
  const [members, setMembers] = useState<StudyGroupMember[]>([])
  const [sharedDecks, setSharedDecks] = useState<SharedGroupDeck[]>([])
  const [activity, setActivity] = useState<StudyGroupActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [shareOpen, setShareOpen] = useState(false)
  const [studyDeck, setStudyDeck] = useState<FlashcardDeckWithId | null>(null)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [memberToRemove, setMemberToRemove] = useState<StudyGroupMember | null>(null)
  const [busyAction, setBusyAction] = useState(false)

  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState('')

  const isOwner = group?.ownerId === user?.uid

  const loadAll = async () => {
    try {
      setLoading(true)
      setError(null)
      const g = await getStudyGroup(groupId)
      if (!g) throw new Error('Study group not found.')
      setGroup(g)
      setNewName(g.name)

      const [m, d, a] = await Promise.all([
        listGroupMembers(groupId).catch(() => []),
        listGroupSharedDecks(groupId).catch(() => []),
        listGroupActivity(groupId).catch(() => []),
      ])
      setMembers(m)
      setSharedDecks(d)
      setActivity(a)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load study group.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [groupId])

  const copyCode = async () => {
    if (!group?.inviteCode) return
    await navigator.clipboard.writeText(group.inviteCode)
    showToast('success', 'Invite code copied to clipboard!')
  }

  const handleRegenerateCode = async () => {
    if (!group || !isOwner || !user) return
    try {
      const next = await regenerateGroupInviteCode(group.id, group.inviteCode, group.name, user.uid)
      setGroup({ ...group, inviteCode: next })
      showToast('success', 'New invite code generated.')
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not regenerate code.')
    }
  }

  const handleRename = async () => {
    if (!group || !isOwner || !newName.trim()) return
    try {
      await renameStudyGroup(group.id, newName.trim())
      setGroup({ ...group, name: newName.trim() })
      setRenaming(false)
      showToast('success', 'Group name updated.')
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not rename group.')
    }
  }

  const handleDeleteGroup = async () => {
    if (!group || !isOwner) return
    setBusyAction(true)
    try {
      await deleteStudyGroupCascade(group.id, group.inviteCode)
      showToast('success', 'Study group deleted.')
      onBack()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not delete group.')
    } finally {
      setBusyAction(false)
    }
  }

  const handleLeaveGroup = async () => {
    if (!group) return
    setBusyAction(true)
    try {
      await callLeaveStudyGroup(group.id)
      showToast('success', 'You left the study group.')
      onBack()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not leave group.')
    } finally {
      setBusyAction(false)
    }
  }

  const handleRemoveMember = async () => {
    if (!group || !memberToRemove) return
    setBusyAction(true)
    try {
      await callRemoveMember(group.id, memberToRemove.uid)
      setMembers((prev) => prev.filter((m) => m.uid !== memberToRemove.uid))
      setMemberToRemove(null)
      showToast('success', `${memberToRemove.displayName} was removed.`)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not remove member.')
    } finally {
      setBusyAction(false)
    }
  }

  const handleUnshareDeck = async (deckId: string) => {
    try {
      await unshareDeckFromGroup(groupId, deckId)
      setSharedDecks((prev) => prev.filter((d) => d.id !== deckId))
      showToast('success', 'Deck removed from group.')
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not remove deck.')
    }
  }

  const startStudying = (shared: SharedGroupDeck) => {
    const studyable: FlashcardDeckWithId = {
      id: shared.id,
      classId: shared.sourceClassId || 'group',
      ownerId: shared.sharedByUid,
      kind: 'personal',
      title: shared.title,
      description: shared.description,
      status: 'private',
      cardCount: shared.cardCount,
      cards: shared.cards,
      createdAt: shared.sharedAt,
      updatedAt: shared.sharedAt,
    }
    setStudyDeck(studyable)
    if (user) {
      void logStudySessionActivity(groupId, shared.title, {
        uid: user.uid,
        displayName: user.displayName || user.email,
      })
    }
  }

  if (loading) {
    return (
      <div className="grid gap-4 p-4">
        <Skeleton className="h-28 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    )
  }

  if (error || !group) {
    return (
      <div className="grid gap-4 p-4">
        <Button variant="secondary" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" />
          Back to study groups
        </Button>
        <Alert tone="error" label="Error">{error || 'Group not found'}</Alert>
      </div>
    )
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" />
          All study groups
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {isOwner ? (
            <Button variant="ghost" onClick={() => setDeleteOpen(true)}>
              <Trash2 size={16} aria-hidden="true" />
              Delete group
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setLeaveOpen(true)}>
              Leave group
            </Button>
          )}
        </div>
      </div>

      <header className="rounded-3xl border border-navy-900-15 bg-white p-6 shadow-sm grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{group.privacy === 'public' ? 'Public group' : 'Private group'}</Badge>
              <span className="text-sm text-navy-900-72 flex items-center gap-1">
                <Users size={14} aria-hidden="true" />
                {members.length} / {group.maxMembers} members
              </span>
            </div>
            {renaming ? (
              <div className="flex items-center gap-2 mt-2">
                <Input
                  label="Rename group"
                  name="new-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={80}
                />
                <Button variant="primary" onClick={() => void handleRename()}>Save</Button>
                <Button variant="secondary" onClick={() => setRenaming(false)}>Cancel</Button>
              </div>
            ) : (
              <h2 className="m-0 text-2xl font-bold text-navy-900 flex items-center gap-3">
                {group.name}
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => setRenaming(true)}
                    className="text-xs text-navy-900-72 underline hover:text-navy-900"
                  >
                    Rename
                  </button>
                )}
              </h2>
            )}
            {group.description && <p className="m-0 text-base text-navy-900 mt-1">{group.description}</p>}
          </div>

          <div className="rounded-2xl border border-navy-900-15 bg-navy-900-05 p-3.5 text-center min-w-44">
            <span className="text-xs font-semibold uppercase text-navy-900-72">Invite code</span>
            <div className="text-xl font-mono font-bold text-navy-900 tracking-wider my-1">
              {group.inviteCode}
            </div>
            <div className="flex items-center justify-center gap-1">
              <button
                type="button"
                onClick={() => void copyCode()}
                className="inline-flex items-center gap-1 text-xs font-medium text-navy-900 hover:underline min-h-8 px-2"
              >
                <Copy size={12} aria-hidden="true" />
                Copy
              </button>
              {isOwner && (
                <button
                  type="button"
                  onClick={() => void handleRegenerateCode()}
                  className="inline-flex items-center gap-1 text-xs font-medium text-navy-900 hover:underline min-h-8 px-2"
                >
                  <RefreshCw size={12} aria-hidden="true" />
                  New
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 grid gap-6">
          <section className="rounded-3xl border border-navy-900-15 bg-white p-5 shadow-sm grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="m-0 text-xl font-bold text-navy-900">Shared flashcard decks</h3>
              <Button variant="primary" onClick={() => setShareOpen(true)}>
                <Plus size={16} aria-hidden="true" />
                Share deck
              </Button>
            </div>

            {sharedDecks.length === 0 ? (
              <EmptyState
                title="No shared decks yet"
                description="Share flashcards from your library so group members can study together."
                action={
                  <Button variant="primary" onClick={() => setShareOpen(true)}>
                    <Plus size={16} aria-hidden="true" />
                    Share first deck
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {sharedDecks.map((deck) => (
                  <article
                    key={deck.id}
                    className="flex flex-col justify-between rounded-2xl border border-navy-900-15 bg-navy-900-05 p-4"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs text-navy-900-72">Shared by {deck.sharedByName}</span>
                        <Badge>{deck.cardCount} cards</Badge>
                      </div>
                      <h4 className="m-0 font-bold text-navy-900 text-base">{deck.title}</h4>
                      {deck.description && (
                        <p className="mt-1 text-sm text-navy-900-72 line-clamp-2">{deck.description}</p>
                      )}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-navy-900-10 pt-3">
                      <Button variant="primary" onClick={() => startStudying(deck)}>
                        <Play size={16} aria-hidden="true" />
                        Study
                      </Button>
                      {(isOwner || deck.sharedByUid === user?.uid) && (
                        <Button
                          variant="ghost"
                          onClick={() => void handleUnshareDeck(deck.id)}
                          aria-label={`Remove deck ${deck.title}`}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-navy-900-15 bg-white p-5 shadow-sm grid gap-3">
            <h3 className="m-0 text-xl font-bold text-navy-900">Recent group activity</h3>
            {activity.length === 0 ? (
              <p className="m-0 text-sm text-navy-900-72">No activity recorded yet.</p>
            ) : (
              <ul className="m-0 list-none p-0 grid gap-2">
                {activity.map((act) => (
                  <li
                    key={act.id}
                    className="flex items-center justify-between text-sm py-1.5 border-b border-navy-900-05 last:border-b-0"
                  >
                    <span className="text-navy-900">
                      <strong>{act.actorName}</strong> {act.details}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="rounded-3xl border border-navy-900-15 bg-white p-5 shadow-sm grid gap-3 self-start">
          <h3 className="m-0 text-xl font-bold text-navy-900">
            Members ({members.length})
          </h3>
          <ul className="m-0 list-none p-0 grid gap-2" aria-label="Group members list">
            {members.map((m) => {
              const isSelf = m.uid === user?.uid
              return (
                <li
                  key={m.uid}
                  className="flex items-center justify-between gap-2 rounded-xl p-2 bg-navy-900-05"
                >
                  <div className="grid">
                    <span className="font-semibold text-sm text-navy-900">
                      {m.displayName} {isSelf && '(You)'}
                    </span>
                    <span className="text-xs text-navy-900-72 capitalize">{m.role}</span>
                  </div>
                  {isOwner && m.role !== 'owner' && (
                    <button
                      type="button"
                      onClick={() => setMemberToRemove(m)}
                      className="text-xs text-navy-900-72 hover:text-navy-900 underline min-h-8 px-2"
                    >
                      Remove
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      </div>

      <ShareDeckDialog
        groupId={groupId}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        onShared={() => void loadAll()}
      />

      {studyDeck && (
        <FlashcardStudyDialog deck={studyDeck} onClose={() => setStudyDeck(null)} />
      )}

      {deleteOpen && (
        <ConfirmDialog
          open
          title="Delete study group?"
          description="Are you sure? All shared decks, invite codes, and activity history for this group will be deleted."
          confirmLabel="Delete group"
          busy={busyAction}
          closeOnConfirm={false}
          onClose={() => setDeleteOpen(false)}
          onConfirm={() => void handleDeleteGroup()}
        />
      )}

      {leaveOpen && (
        <ConfirmDialog
          open
          title="Leave study group?"
          description="You will lose access to shared decks and group study activities."
          confirmLabel="Leave group"
          busy={busyAction}
          closeOnConfirm={false}
          onClose={() => setLeaveOpen(false)}
          onConfirm={() => void handleLeaveGroup()}
        />
      )}

      {memberToRemove && (
        <ConfirmDialog
          open
          title="Remove member?"
          description={`Remove ${memberToRemove.displayName} from this study group?`}
          confirmLabel="Remove member"
          busy={busyAction}
          closeOnConfirm={false}
          onClose={() => setMemberToRemove(null)}
          onConfirm={() => void handleRemoveMember()}
        />
      )}
    </div>
  )
}
