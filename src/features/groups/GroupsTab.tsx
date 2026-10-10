import { useEffect, useState } from 'react'
import { ArrowLeft, Copy, Ellipsis, Plus, Users } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { useToast } from '../../shared/ui/useToast'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Input } from '../../shared/ui/Input'
import { Skeleton } from '../../shared/ui/Skeleton'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { DropdownMenu } from '../../shared/ui/DropdownMenu'
import { createGroup, deleteGroup, importGroupShare, joinGroup, leaveGroup, previewGroup, removeGroupMember, regenerateGroupCode, setGroupJoining, shareStudyItem, unshareGroupItem, watchGroup, watchGroupMembers, watchGroupShares, watchMyGroups } from './services'
import { JoinGameForm } from '../games'
import { HostGroupGame } from '../games/components/HostGroupGame'
import { listLessonPlans } from '../lessons/services'
import { watchMyCanvasesAcrossClasses } from '../learningCanvas/services'
import { useFlashcardDecks } from '../flashcards'
import type { LessonPlan } from '../lessons/types'
import type { LearningCanvasWithId } from '../learningCanvas/types'
import type { GroupPreview, GroupShare, StudyGroup, StudyGroupMember } from './types'

export function GroupsTab() {
  const { user, profile } = useAuth()
  const { showToast } = useToast()
  const displayName = profile?.name || user?.displayName || 'Learner'
  const [groups, setGroups] = useState<StudyGroup[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [group, setGroup] = useState<StudyGroup | null>(null)
  const [members, setMembers] = useState<StudyGroupMember[]>([])
  const [shares, setShares] = useState<GroupShare[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [code, setCode] = useState('')
  const [preview, setPreview] = useState<GroupPreview | null>(null)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState<'leave' | 'delete' | string | null>(null)
  const [plans, setPlans] = useState<LessonPlan[]>([])
  const [canvases, setCanvases] = useState<LearningCanvasWithId[]>([])
  const [selectedGroup, setSelectedGroup] = useState('')
  const [selectedItem, setSelectedItem] = useState('')
  const { decks } = useFlashcardDecks({ role: 'student', uid: user?.uid, classIds: user?.uid ? [user.uid] : [] })
  useEffect(() => user ? watchMyGroups(user.uid, items => { setGroups(items); setLoading(false); setLoadError('') }, cause => { setLoadError(cause.message); setLoading(false) }) : undefined, [user?.uid])
  useEffect(() => {
    if (!user) return undefined
    let active = true
    void listLessonPlans(user.uid).then(items => { if (active) setPlans(items) }).catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load lesson plans.'))
    const stop = watchMyCanvasesAcrossClasses(user.uid, setCanvases, cause => setError(cause.message))
    return () => { active = false; stop() }
  }, [user?.uid])
  useEffect(() => {
    if (!selectedId) { setGroup(null); return undefined }
    // Being removed from a group (or the group being deleted) makes Firestore deny the listeners: go back to the list.
    const failed = (cause: Error) => { if ((cause as { code?: string }).code === 'permission-denied') { setSelectedId(''); setError('You no longer have access to that group.') } else setError(cause.message) }
    const stops = [watchGroup(selectedId, setGroup, failed), watchGroupMembers(selectedId, setMembers, failed), watchGroupShares(selectedId, setShares, failed)]
    return () => stops.forEach(stop => stop())
  }, [selectedId])
  const run = async (action: () => Promise<unknown>, success: string): Promise<boolean> => { setBusy(true); setError(''); try { await action(); showToast('success', success); return true } catch (cause) { setError(cause instanceof Error ? cause.message : 'The action failed.'); return false } finally { setBusy(false); setConfirm(null) } }
  const copyCode = async () => { if (!group) return; await navigator.clipboard.writeText(group.joinCode); showToast('success', 'Invite code copied.') }
  if (group) return <section className="grid gap-4" aria-labelledby="group-title">
    <Button type="button" variant="tertiary" onClick={() => setSelectedId('')}><ArrowLeft size={18} aria-hidden="true"/>All groups</Button>
    <div className="rounded-3xl border border-navy-900-15 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="group-title" className="m-0 text-2xl font-bold text-navy-900">{group.name}</h2><p className="m-0 mt-2 text-base text-navy-900">{group.description || 'A private study group'} · {group.memberCount} members</p></div><p className="m-0 rounded-full bg-navy-900-5 px-3 py-2 text-sm text-navy-900">{group.ownerId === user?.uid ? 'Owner' : 'Member'}</p></div>
    {group.ownerId === user?.uid && <div className="mt-4 flex flex-wrap items-center gap-2"><code className="rounded-lg border border-navy-900-30 px-4 py-3 text-lg font-bold tracking-widest text-navy-900">{group.joinCode}</code><Button variant="secondary" onClick={() => void copyCode()}><Copy size={16} aria-hidden="true"/>Copy code</Button><Button variant="secondary" disabled={busy} onClick={() => void run(async () => { const next = await regenerateGroupCode(group.id, user.uid); setGroup({ ...group, joinCode: next }) }, 'Invite code regenerated.')}>Regenerate code</Button><Button variant="secondary" disabled={busy} onClick={() => void run(() => setGroupJoining(group.id, !group.joiningOpen), group.joiningOpen ? 'Joining paused.' : 'Joining opened.')}>{group.joiningOpen ? 'Pause joining' : 'Open joining'}</Button></div>}
    {group.ownerId !== user?.uid && <Button variant="secondary" disabled={busy} onClick={() => setConfirm('leave')}>Leave group</Button>}
    {group.ownerId === user?.uid && <Button variant="secondary" disabled={busy} onClick={() => setConfirm('delete')}>Delete group</Button>}</div>
    <div className="grid gap-4 md:grid-cols-2"><section className="rounded-3xl border border-navy-900-15 bg-white p-5"><h3 className="m-0 text-lg font-bold text-navy-900">Members</h3><ul className="m-0 mt-3 grid list-none gap-2 p-0">{members.map(member => <li key={member.uid} className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-xl border border-navy-900-15 p-3 text-base text-navy-900"><span>{member.displayName}{member.role === 'owner' ? ' · Owner' : ''}</span>{group.ownerId === user?.uid && member.uid !== user.uid && <Button variant="tertiary" onClick={() => setConfirm(member.uid)}>Remove</Button>}</li>)}</ul></section><section className="rounded-3xl border border-navy-900-15 bg-white p-5"><h3 className="m-0 text-lg font-bold text-navy-900">Shared study copies</h3><p className="text-base text-navy-900">Shared items are read-only snapshots. Later edits to the original do not sync.</p>{shares.length ? <ul className="grid list-none gap-2 p-0">{shares.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-navy-900-15 p-3 text-base text-navy-900"><span>{item.title} <span className="text-sm">· {item.kind}</span></span><div className="flex gap-2"><Button variant="secondary" disabled={busy} onClick={() => user && void run(() => importGroupShare(user.uid, group.id, item.id), 'Imported as your private copy.')}>Import as my copy</Button>{(item.ownerId === user?.uid || group.ownerId === user?.uid) && <Button variant="tertiary" disabled={busy} onClick={() => void run(() => unshareGroupItem(group.id, item.id), 'Shared copy removed.')}>Remove</Button>}</div></li>)}</ul> : <p className="text-base text-navy-900">No study copies have been shared yet.</p>}</section></div>
    <HostGroupGame groupId={group.id} decks={decks} plans={plans}/>
    {error && <Alert tone="error" label="Group action failed">{error}</Alert>}
    <ConfirmDialog open={confirm === 'leave'} title="Leave this group?" description="Your private study materials stay in your account." confirmLabel="Leave group" onClose={() => setConfirm(null)} onConfirm={() => { void run(() => leaveGroup(group.id), 'You left the group.').then(ok => { if (ok) setSelectedId('') }) }}/>
    <ConfirmDialog open={confirm === 'delete'} title="Delete this group?" description="Delete the group and its shared snapshots? Your private materials stay in your account." requiredName={group.name} confirmLabel="Delete group" onClose={() => setConfirm(null)} onConfirm={() => { void run(() => deleteGroup(group.id), 'Group deleted.').then(ok => { if (ok) setSelectedId('') }) }}/>
    <ConfirmDialog open={typeof confirm === 'string' && !['leave', 'delete'].includes(confirm)} title="Remove this member?" description="They will lose access to the group and its shared copies." confirmLabel="Remove member" onClose={() => setConfirm(null)} onConfirm={() => typeof confirm === 'string' && void run(() => removeGroupMember(group.id, confirm), 'Member removed.')}/>
  </section>
  const itemOptions = [
    ...plans.map(item => ({ key: `lessonPlan:${item.id}:`, label: `Lesson plan · ${item.title}` })),
    ...decks.map(item => ({ key: `deck:${item.id}:${item.classId}`, label: `Deck · ${item.title}` })),
    ...canvases.filter(item => item.sourceCanvasId !== 'note').map(item => ({ key: `canvas:${item.id}:${item.classId}`, label: `Canvas · ${item.title}` })),
  ]
  return <div className="grid gap-4">
    <div className="grid gap-4 rounded-3xl border border-navy-900-15 bg-white p-5 shadow-sm md:grid-cols-2"><form className="grid content-start gap-3" onSubmit={event => { event.preventDefault(); if (!user) return; void run(async () => { const result = await createGroup(name, description, displayName); setName(''); setDescription(''); setSelectedId(result.groupId) }, 'Group created.') }}><h2 className="m-0 text-xl font-bold text-navy-900">Create a group</h2><Input label="Group name" value={name} maxLength={80} required onChange={event => setName(event.target.value)}/><Input label="Description" value={description} maxLength={300} onChange={event => setDescription(event.target.value)}/><Button type="submit" disabled={busy || !name.trim()}><Plus size={16} aria-hidden="true"/>Create group</Button></form>
    <div className="grid content-start gap-3"><h2 className="m-0 text-xl font-bold text-navy-900">Join a group</h2><Input label="8-character invite code" value={code} maxLength={10} onChange={event => { setCode(event.target.value.toUpperCase()); setPreview(null) }}/><Button variant="secondary" disabled={busy || !code.trim()} onClick={() => void run(async () => setPreview(await previewGroup(code)), 'Group found.')}>Preview group</Button>{preview && <div className="rounded-xl border border-navy-900-15 p-4"><h3 className="m-0 text-lg font-bold text-navy-900">{preview.name}</h3><p className="text-base text-navy-900">{preview.description || 'Study together'} · {preview.memberCount}/30 members</p><Button disabled={busy || !preview.joiningOpen} onClick={() => user && void run(async () => { await joinGroup(code, displayName); setPreview(null); setCode('') }, 'You joined the group.')}>Join group</Button></div>}</div></div>
    <div className="rounded-3xl border border-navy-900-15 bg-white p-5 shadow-sm"><JoinGameForm/></div>
    {error && <Alert tone="error" label="Could not complete group action">{error}</Alert>}
    {groups.length > 0 && itemOptions.length > 0 && <section className="grid gap-3 rounded-3xl border border-navy-900-15 bg-white p-5 shadow-sm"><h2 className="m-0 text-xl font-bold text-navy-900">Share to group</h2><p className="m-0 text-base text-navy-900">Members receive a read-only copy. Later edits to your original do not sync.</p><label className="field"><span className="field__label">Group</span><select className="field__control" value={selectedGroup} onChange={event => setSelectedGroup(event.target.value)}><option value="">Choose a group</option>{groups.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field"><span className="field__label">Your study item</span><select className="field__control" value={selectedItem} onChange={event => setSelectedItem(event.target.value)}><option value="">Choose a lesson plan, deck, or canvas</option>{itemOptions.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label><Button disabled={busy || !selectedGroup || !selectedItem} onClick={() => { const [kind, id, classId] = selectedItem.split(':'); if (kind && id) void run(() => shareStudyItem(selectedGroup, kind as 'lessonPlan' | 'deck' | 'canvas', id, classId || undefined), 'Read-only snapshot shared.') }}>Share snapshot</Button></section>}
    {loading ? <Skeleton className="h-28 rounded-2xl"/> : loadError ? <Alert tone="error" label="Could not load your groups">{loadError}</Alert> : groups.length ? <section aria-label="My groups" className="grid gap-2"><h2 className="m-0 text-xl font-bold text-navy-900">My groups</h2>{groups.map(item => <div key={item.id} className="flex min-h-14 items-center gap-2 rounded-2xl border border-navy-900-15 bg-white p-2 shadow-sm"><button type="button" onClick={() => setSelectedId(item.id)} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl p-2 text-left text-base text-navy-900 hover:bg-navy-900-5"><Users size={20} aria-hidden="true"/><span className="truncate font-semibold">{item.name}</span><span className="ml-auto shrink-0">{item.memberCount} members</span></button><DropdownMenu label={`More actions for ${item.name}`} iconOnly className="lg:hidden" trigger={<Ellipsis size={20} aria-hidden="true"/>}><button type="button" role="menuitem" onClick={() => setSelectedId(item.id)}>Open group</button></DropdownMenu></div>)}</section> : <EmptyState title="No study groups yet" description="Create a group or join one with an invite code. Your private learning materials stay private."/>}
  </div>
}
