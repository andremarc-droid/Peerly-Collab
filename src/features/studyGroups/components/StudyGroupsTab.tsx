import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, UserPlus, Users } from 'lucide-react'
import { Alert } from '../../../shared/ui/Alert'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { Input } from '../../../shared/ui/Input'
import { Skeleton } from '../../../shared/ui/Skeleton'
import { useAuth } from '../../auth/useAuth'
import { listMyStudyGroups, listPublicStudyGroups } from '../services'
import type { StudyGroup } from '../types'
import { CreateGroupDialog } from './CreateGroupDialog'
import { JoinGroupDialog } from './JoinGroupDialog'
import { StudyGroupDetailPage } from './StudyGroupDetailPage'

export function StudyGroupsTab() {
  const { user } = useAuth()

  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [tab, setTab] = useState<'my' | 'explore'>('my')

  const [myGroups, setMyGroups] = useState<StudyGroup[]>([])
  const [publicGroups, setPublicGroups] = useState<StudyGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)

  const loadData = async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const [mine, explore] = await Promise.all([
        listMyStudyGroups(user.uid),
        listPublicStudyGroups(),
      ])
      setMyGroups(mine)
      setPublicGroups(explore)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load study groups.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [user?.uid])

  const groupsToDisplay = useMemo(() => {
    const list = tab === 'my' ? myGroups : publicGroups
    const needle = search.trim().toLowerCase()
    if (!needle) return list
    return list.filter(
      (g) =>
        g.name.toLowerCase().includes(needle) ||
        (g.description && g.description.toLowerCase().includes(needle)),
    )
  }, [tab, myGroups, publicGroups, search])

  if (activeGroupId) {
    return (
      <StudyGroupDetailPage
        groupId={activeGroupId}
        onBack={() => {
          setActiveGroupId(null)
          void loadData()
        }}
      />
    )
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="m-0 text-2xl font-bold text-navy-900">Study Groups</h2>
          <p className="m-0 text-base text-navy-900 mt-1">
            Collaborate, share study decks, and practice with classmates.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setJoinOpen(true)}>
            <UserPlus size={16} aria-hidden="true" />
            Join with code
          </Button>
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus size={16} aria-hidden="true" />
            Create study group
          </Button>
        </div>
      </div>

      {error && <Alert tone="error" label="Error">{error}</Alert>}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-900-15 pb-3">
        <div className="flex gap-2" role="tablist" aria-label="Group tabs">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'my'}
            onClick={() => setTab('my')}
            className={`min-h-11 rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-navy-900 ${
              tab === 'my'
                ? 'bg-navy-900 text-white'
                : 'bg-navy-900-08 text-navy-900 hover:bg-navy-900-15'
            }`}
          >
            My groups ({myGroups.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'explore'}
            onClick={() => setTab('explore')}
            className={`min-h-11 rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-navy-900 ${
              tab === 'explore'
                ? 'bg-navy-900 text-white'
                : 'bg-navy-900-08 text-navy-900 hover:bg-navy-900-15'
            }`}
          >
            Explore public ({publicGroups.length})
          </button>
        </div>

        <div className="w-full sm:w-64">
          <Input
            label="Search groups"
            name="search-study-groups"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search groups…"
            leadingIcon={<Search size={16} aria-hidden="true" />}
          />
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-40 rounded-3xl" />
          <Skeleton className="h-40 rounded-3xl" />
          <Skeleton className="h-40 rounded-3xl" />
        </div>
      ) : groupsToDisplay.length === 0 ? (
        <EmptyState
          title={tab === 'my' ? 'No study groups yet' : 'No public study groups found'}
          description={
            tab === 'my'
              ? 'Create a study group or enter an invite code to join one.'
              : search
                ? 'No public groups match your search.'
                : 'Be the first to create a public study group!'
          }
          action={
            tab === 'my' ? (
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                <Plus size={16} aria-hidden="true" />
                Create study group
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groupsToDisplay.map((grp) => (
            <article
              key={grp.id}
              className="flex flex-col justify-between rounded-3xl border border-navy-900-15 bg-white p-5 shadow-sm transition hover:border-navy-900-30"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Badge>{grp.privacy === 'public' ? 'Public' : 'Private'}</Badge>
                  <span className="text-xs text-navy-900-72 flex items-center gap-1">
                    <Users size={12} aria-hidden="true" />
                    {grp.memberCount} / {grp.maxMembers}
                  </span>
                </div>
                <h3 className="m-0 text-lg font-bold text-navy-900 line-clamp-1">{grp.name}</h3>
                <p className="mt-2 text-sm text-navy-900-72 line-clamp-2">
                  {grp.description || 'No description provided.'}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-navy-900-10 pt-3">
                <span className="text-xs text-navy-900-72">By {grp.ownerDisplayName}</span>
                <Button variant="primary" onClick={() => setActiveGroupId(grp.id)}>
                  Open group
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <CreateGroupDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(gid) => {
          void loadData()
          setActiveGroupId(gid)
        }}
      />

      <JoinGroupDialog
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        onJoined={(gid) => {
          void loadData()
          setActiveGroupId(gid)
        }}
      />
    </div>
  )
}
