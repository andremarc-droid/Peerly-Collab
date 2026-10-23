import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  Clock,
  Copy,
  FileText,
  Network,
  RefreshCw,
  Trash2,
  Users,
} from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { Alert } from '../../../shared/ui/Alert'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { Input } from '../../../shared/ui/Input'
import { Skeleton } from '../../../shared/ui/Skeleton'
import { useToast } from '../../../shared/ui/useToast'
import { useAuth } from '../../auth/useAuth'
import { FlashcardStudyDialog } from '../../flashcards/components/FlashcardStudyDialog'
import type { FlashcardDeckWithId } from '../../flashcards/types'
import { loadNoteContent } from '../../learningCanvas/noteService'
import { getCanvas, getContent } from '../../learningCanvas/services'
import { getLessonPlan } from '../../lessons/services'
import {
  buildSharedCanvasPayload,
  buildSharedDeckPayload,
  buildSharedLessonPlanPayload,
  buildSharedNotePayload,
} from '../schemas'
import {
  checkIsGroupMember,
  copySharedItemToLibrary,
  deleteStudyGroupCascade,
  getStudyGroup,
  leaveStudyGroupCallable as callLeaveStudyGroup,
  logStudySessionActivity,
  regenerateGroupInviteCode,
  removeStudyGroupMemberCallable as callRemoveMember,
  renameStudyGroup,
  subscribeGroupActivity,
  subscribeGroupMembers,
  subscribeGroupSharedItems,
  unshareItemFromGroup,
  updateSharedItem,
} from '../services'
import type {
  SharedCanvasPayload,
  SharedDeckPayload,
  SharedGroupItem,
  SharedItemKind,
  SharedNotePayload,
  StudyGroup,
  StudyGroupActivity,
  StudyGroupMember,
} from '../types'
import { ItemPreviewDialog } from './ItemPreviewDialog'
import { SharedItemsTabContent } from './SharedItemsTabContent'
import { ShareItemDialog } from './ShareItemDialog'
import { StudyGroupPreview } from './StudyGroupPreview'

interface Props {
  groupId: string
  onBack: () => void
}

type TabType = 'decks' | 'canvases' | 'lessons' | 'notes' | 'activity' | 'members'

export function StudyGroupDetailPage({ groupId, onBack }: Props) {
  const { user } = useAuth()
  const { showToast } = useToast()

  const [group, setGroup] = useState<StudyGroup | null>(null)
  const [isMember, setIsMember] = useState<boolean | null>(null)
  const [members, setMembers] = useState<StudyGroupMember[]>([])
  const [sharedItems, setSharedItems] = useState<SharedGroupItem[]>([])
  const [activity, setActivity] = useState<StudyGroupActivity[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabType>('decks')

  const [itemsError, setItemsError] = useState<string | null>(null)
  const [membersError, setMembersError] = useState<string | null>(null)
  const [activityError, setActivityError] = useState<string | null>(null)

  const [itemsRetryKey, setItemsRetryKey] = useState(0)
  const [membersRetryKey, setMembersRetryKey] = useState(0)
  const [activityRetryKey, setActivityRetryKey] = useState(0)

  const [shareOpen, setShareOpen] = useState(false)
  const [shareKind, setShareKind] = useState<SharedItemKind>('deck')

  const [previewItem, setPreviewItem] = useState<SharedGroupItem | null>(null)
  const [studyDeck, setStudyDeck] = useState<FlashcardDeckWithId | null>(null)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [memberToRemove, setMemberToRemove] = useState<StudyGroupMember | null>(null)
  const [itemToRemove, setItemToRemove] = useState<SharedGroupItem | null>(null)
  const [busyAction, setBusyAction] = useState(false)

  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState('')

  const isOwner = group?.ownerId === user?.uid

  const loadGroupInfo = async () => {
    try {
      setLoading(true)
      setError(null)
      const g = await getStudyGroup(groupId).catch(() => null)
      setGroup(g)
      if (g) setNewName(g.name)

      if (user) {
        const member = await checkIsGroupMember(groupId, user.uid).catch(() => false)
        setIsMember(member)
      } else {
        setIsMember(false)
      }
    } catch (err) {
      console.error('Failed to load study group info:', err)
      setError(err instanceof Error ? err.message : 'Could not load study group.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadGroupInfo()
  }, [groupId, user?.uid])

  useEffect(() => {
    if (!isMember) return

    setItemsError(null)
    const unsubItems = subscribeGroupSharedItems(
      groupId,
      'all',
      (items) => {
        setSharedItems(items)
        setItemsError(null)
      },
      (err) => {
        console.error('Failed to subscribe to shared items:', err)
        setItemsError(err.message || 'Shared items couldn’t load.')
      },
    )

    return () => unsubItems()
  }, [groupId, isMember, itemsRetryKey])

  useEffect(() => {
    if (!isMember) return

    setMembersError(null)
    const unsubMembers = subscribeGroupMembers(
      groupId,
      (m) => {
        setMembers(m)
        setMembersError(null)
      },
      (err) => {
        console.error('Failed to subscribe to group members:', err)
        setMembersError(err.message || 'Members couldn’t load.')
      },
    )

    return () => unsubMembers()
  }, [groupId, isMember, membersRetryKey])

  useEffect(() => {
    if (!isMember) return

    setActivityError(null)
    const unsubActivity = subscribeGroupActivity(
      groupId,
      (acts) => {
        setActivity(acts)
        setActivityError(null)
      },
      (err) => {
        console.error('Failed to subscribe to group activity:', err)
        setActivityError(err.message || 'Activity couldn’t load.')
      },
      25,
    )

    return () => unsubActivity()
  }, [groupId, isMember, activityRetryKey])

  const decks = useMemo(() => sharedItems.filter((i) => i.kind === 'deck'), [sharedItems])
  const canvases = useMemo(() => sharedItems.filter((i) => i.kind === 'canvas'), [sharedItems])
  const lessons = useMemo(() => sharedItems.filter((i) => i.kind === 'lessonPlan'), [sharedItems])
  const notes = useMemo(() => sharedItems.filter((i) => i.kind === 'note'), [sharedItems])

  const handleCopyItem = async (item: SharedGroupItem) => {
    if (!user) return
    try {
      await copySharedItemToLibrary(item, user.uid)
      showToast('success', `Saved a copy of "${item.title}" to your library!`)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not save copy.')
    }
  }

  const handleUpdateItem = async (item: SharedGroupItem) => {
    if (!user || item.sharedByUid !== user.uid) return
    try {
      let payload = item.payload
      let title = item.title
      let summary = item.summary

      if (item.kind === 'deck') {
        const deckId = item.originalItemId || item.id
        const classId = (item.payload as SharedDeckPayload).sourceClassId || 'personal'
        const snap = await getDoc(doc(firestore, 'classes', classId, 'flashcardDecks', deckId))
        if (!snap.exists()) throw new Error('Original deck not found in your library.')
        const data = snap.data() as any
        title = data.title
        summary = data.description
        payload = buildSharedDeckPayload(data.cards, classId)
      } else if (item.kind === 'canvas') {
        const canvasId = item.originalItemId || item.id
        const classId = (item.payload as SharedCanvasPayload).sourceClassId || 'personal'
        const [meta, content] = await Promise.all([getCanvas(classId, canvasId), getContent(classId, canvasId)])
        if (!meta || !content) throw new Error('Original canvas not found in your library.')
        title = meta.title
        summary = meta.description
        payload = buildSharedCanvasPayload(content.nodes, content.edges, content.viewport, classId)
      } else if (item.kind === 'lessonPlan') {
        const planId = item.originalItemId || item.id
        const full = await getLessonPlan(user.uid, planId)
        if (!full) throw new Error('Original lesson plan not found in your library.')
        title = full.plan.title
        summary = full.plan.topic
        payload = buildSharedLessonPlanPayload(full.plan.topic, full.plan.level, full.plan.order, full.lessons)
      } else if (item.kind === 'note') {
        const noteId = item.originalItemId || item.id
        const classId = (item.payload as SharedNotePayload).sourceClassId || 'personal'
        const [meta, text] = await Promise.all([getCanvas(classId, noteId), loadNoteContent(classId, noteId)])
        if (!meta) throw new Error('Original note not found in your library.')
        title = meta.title
        summary = meta.description
        payload = buildSharedNotePayload(text, classId)
      }

      await updateSharedItem(
        groupId,
        item.id,
        { title, summary, payload, kind: item.kind },
        { uid: user.uid, displayName: user.displayName || user.email },
      )
      showToast('success', `Updated shared copy of "${title}"!`)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not update item.')
    }
  }

  const handleRemoveItem = async () => {
    if (!itemToRemove || !user) return
    setBusyAction(true)
    try {
      await unshareItemFromGroup(
        groupId,
        itemToRemove.id,
        itemToRemove.kind,
        itemToRemove.title,
        { uid: user.uid, displayName: user.displayName || user.email },
      )
      setItemToRemove(null)
      showToast('success', `Removed "${itemToRemove.title}" from group.`)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not remove item.')
    } finally {
      setBusyAction(false)
    }
  }

  const startStudyingDeck = (item: SharedGroupItem) => {
    const payload = item.payload as SharedDeckPayload
    const studyable: FlashcardDeckWithId = {
      id: item.id,
      classId: payload.sourceClassId || 'group',
      ownerId: item.sharedByUid,
      kind: 'personal',
      title: item.title,
      description: item.summary || '',
      status: 'private',
      cardCount: payload.cardCount,
      cards: payload.cards,
      createdAt: item.sharedAt,
      updatedAt: item.sharedAt,
    }
    setStudyDeck(studyable)
    if (user) {
      void logStudySessionActivity(groupId, item.title, {
        uid: user.uid,
        displayName: user.displayName || user.email,
      })
    }
  }

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
      setMemberToRemove(null)
      showToast('success', `${memberToRemove.displayName} was removed.`)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not remove member.')
    } finally {
      setBusyAction(false)
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

  if (!isMember) {
    return (
      <StudyGroupPreview
        group={group}
        groupId={groupId}
        onJoined={() => {
          setIsMember(true)
          void loadGroupInfo()
        }}
        onBack={onBack}
      />
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

  const tabDefs: Array<{ id: TabType; label: string; count: number; icon: any }> = [
    { id: 'decks', label: 'Decks', count: decks.length, icon: BookOpen },
    { id: 'canvases', label: 'Canvases', count: canvases.length, icon: Network },
    { id: 'lessons', label: 'Lessons', count: lessons.length, icon: FileText },
    { id: 'notes', label: 'Notes', count: notes.length, icon: FileText },
    { id: 'activity', label: 'Activity', count: activity.length, icon: Clock },
    { id: 'members', label: 'Members', count: members.length, icon: Users },
  ]

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
                {members.length > 0 ? members.length : group.memberCount} / {group.maxMembers} members
              </span>
              <span className="text-sm text-navy-900-72">· {sharedItems.length} shared items</span>
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

      {/* Group Navigation Tabs (44px touch target) */}
      <div className="flex flex-wrap gap-2 border-b border-navy-900-15 pb-2" role="tablist" aria-label="Study group tabs">
        {tabDefs.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 min-h-11 rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-navy-900 ${
                active ? 'bg-navy-900 text-white' : 'bg-navy-900-08 text-navy-900 hover:bg-navy-900-15'
              }`}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{t.label}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-navy-900-10'}`}>
                {t.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Tab Panels */}
      {tab === 'decks' && (
        <SharedItemsTabContent
          kind="deck"
          items={decks}
          loading={loading}
          error={itemsError}
          onRetry={() => setItemsRetryKey((k) => k + 1)}
          onOpenShare={() => {
            setShareKind('deck')
            setShareOpen(true)
          }}
          onViewItem={(item) => startStudyingDeck(item)}
          onSaveCopy={handleCopyItem}
          onUpdateItem={handleUpdateItem}
          onRemoveItem={(item) => setItemToRemove(item)}
          isOwner={isOwner}
          currentUid={user?.uid}
        />
      )}

      {tab === 'canvases' && (
        <SharedItemsTabContent
          kind="canvas"
          items={canvases}
          loading={loading}
          error={itemsError}
          onRetry={() => setItemsRetryKey((k) => k + 1)}
          onOpenShare={() => {
            setShareKind('canvas')
            setShareOpen(true)
          }}
          onViewItem={(item) => setPreviewItem(item)}
          onSaveCopy={handleCopyItem}
          onUpdateItem={handleUpdateItem}
          onRemoveItem={(item) => setItemToRemove(item)}
          isOwner={isOwner}
          currentUid={user?.uid}
        />
      )}

      {tab === 'lessons' && (
        <SharedItemsTabContent
          kind="lessonPlan"
          items={lessons}
          loading={loading}
          error={itemsError}
          onRetry={() => setItemsRetryKey((k) => k + 1)}
          onOpenShare={() => {
            setShareKind('lessonPlan')
            setShareOpen(true)
          }}
          onViewItem={(item) => setPreviewItem(item)}
          onSaveCopy={handleCopyItem}
          onUpdateItem={handleUpdateItem}
          onRemoveItem={(item) => setItemToRemove(item)}
          isOwner={isOwner}
          currentUid={user?.uid}
        />
      )}

      {tab === 'notes' && (
        <SharedItemsTabContent
          kind="note"
          items={notes}
          loading={loading}
          error={itemsError}
          onRetry={() => setItemsRetryKey((k) => k + 1)}
          onOpenShare={() => {
            setShareKind('note')
            setShareOpen(true)
          }}
          onViewItem={(item) => setPreviewItem(item)}
          onSaveCopy={handleCopyItem}
          onUpdateItem={handleUpdateItem}
          onRemoveItem={(item) => setItemToRemove(item)}
          isOwner={isOwner}
          currentUid={user?.uid}
        />
      )}

      {tab === 'activity' && (
        <section className="rounded-3xl border border-navy-900-15 bg-white p-5 shadow-sm grid gap-3">
          <h3 className="m-0 text-xl font-bold text-navy-900">Recent group activity</h3>
          {activityError ? (
            <div className="rounded-2xl border border-navy-900-15 bg-navy-900-05 p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="m-0 text-sm font-semibold text-navy-900">Activity couldn't load</p>
                <p className="m-0 text-xs text-navy-900-72">{activityError}</p>
              </div>
              <Button variant="secondary" onClick={() => setActivityRetryKey((k) => k + 1)}>
                <RefreshCw size={14} aria-hidden="true" />
                Retry
              </Button>
            </div>
          ) : activity.length === 0 ? (
            <p className="m-0 text-sm text-navy-900-72">No activity recorded yet.</p>
          ) : (
            <ul className="m-0 list-none p-0 grid gap-2">
              {activity.map((act) => (
                <li
                  key={act.id}
                  className="flex items-center justify-between text-sm py-2 border-b border-navy-900-05 last:border-b-0"
                >
                  <span className="text-navy-900">
                    <strong>{act.actorName}</strong> {act.details}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'members' && (
        <section className="rounded-3xl border border-navy-900-15 bg-white p-5 shadow-sm grid gap-3">
          <h3 className="m-0 text-xl font-bold text-navy-900">Members ({members.length})</h3>
          {membersError ? (
            <div className="rounded-2xl border border-navy-900-15 bg-navy-900-05 p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="m-0 text-sm font-semibold text-navy-900">Members couldn't load</p>
                <p className="m-0 text-xs text-navy-900-72">{membersError}</p>
              </div>
              <Button variant="secondary" onClick={() => setMembersRetryKey((k) => k + 1)}>
                <RefreshCw size={14} aria-hidden="true" />
                Retry
              </Button>
            </div>
          ) : (
            <ul className="m-0 list-none p-0 grid gap-2" aria-label="Group members list">
              {members.map((m) => {
                const isSelf = m.uid === user?.uid
                return (
                  <li
                    key={m.uid}
                    className="flex items-center justify-between gap-2 rounded-xl p-3 bg-navy-900-05"
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
          )}
        </section>
      )}

      {/* Share Dialog */}
      <ShareItemDialog
        groupId={groupId}
        open={shareOpen}
        initialKind={shareKind}
        onClose={() => setShareOpen(false)}
        onShared={() => {}}
      />

      {/* View Item Dialog */}
      {previewItem && (
        <ItemPreviewDialog
          item={previewItem}
          open={Boolean(previewItem)}
          onClose={() => setPreviewItem(null)}
          onSaveCopy={handleCopyItem}
          onStudyDeck={(item) => startStudyingDeck(item)}
        />
      )}

      {/* Flashcard Study Dialog */}
      {studyDeck && (
        <FlashcardStudyDialog deck={studyDeck} onClose={() => setStudyDeck(null)} />
      )}

      {/* Confirm Remove Item */}
      {itemToRemove && (
        <ConfirmDialog
          open
          title="Remove shared item?"
          description={`Remove "${itemToRemove.title}" from this study group? Group members will no longer be able to view or copy it.`}
          confirmLabel="Remove item"
          busy={busyAction}
          closeOnConfirm={false}
          onClose={() => setItemToRemove(null)}
          onConfirm={() => void handleRemoveItem()}
        />
      )}

      {/* Confirm Delete Group */}
      {deleteOpen && (
        <ConfirmDialog
          open
          title="Delete study group?"
          description="Are you sure? All shared items, invite codes, and activity history for this group will be deleted."
          confirmLabel="Delete group"
          busy={busyAction}
          closeOnConfirm={false}
          onClose={() => setDeleteOpen(false)}
          onConfirm={() => void handleDeleteGroup()}
        />
      )}

      {/* Confirm Leave Group */}
      {leaveOpen && (
        <ConfirmDialog
          open
          title="Leave study group?"
          description="You will lose access to shared items and group study activities."
          confirmLabel="Leave group"
          busy={busyAction}
          closeOnConfirm={false}
          onClose={() => setLeaveOpen(false)}
          onConfirm={() => void handleLeaveGroup()}
        />
      )}

      {/* Confirm Remove Member */}
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
