import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Eye, LoaderCircle, Network, Trash2 } from 'lucide-react'
import { Alert } from '../../../shared/ui/Alert'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { watchOwnedGraphs, watchSharedGraphs, type SharedGraphRef } from './sharing'
import { deleteSharedGraph } from './deleteSharedGraph'
import { useToast } from '../../../shared/ui/useToast'

interface SharedGraphListProps {
  uid: string
  selectedClassId: string
  /** Classes this person can see, so graph views they saved themselves can be found. */
  classIds: string[]
  /** The graph view that is open right now, so it can be marked and the rest stay one click away. */
  activeGraphId?: string | null
}

function roleLabel(role: SharedGraphRef['role']): string {
  if (role === 'owner') return 'Yours'
  return role === 'editor' ? 'Can edit' : 'View only'
}

export function SharedGraphList({ uid, selectedClassId, classIds, activeGraphId = null }: SharedGraphListProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const { showToast } = useToast()
  const [sharedWithMe, setSharedWithMe] = useState<SharedGraphRef[]>([])
  const [ownedByMe, setOwnedByMe] = useState<SharedGraphRef[]>([])
  const [error, setError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteSelection, setDeleteSelection] = useState<SharedGraphRef | null>(null)
  const [deletingKey, setDeletingKey] = useState<string | null>(null)
  const classIdsKey = classIds.join('|')

  useEffect(() => {
    return watchSharedGraphs(
      uid,
      (items) => { setSharedWithMe(items); setError(null) },
      (cause) => setError(cause.message),
    )
  }, [uid])

  useEffect(() => {
    return watchOwnedGraphs(
      uid,
      classIdsKey ? classIdsKey.split('|') : [],
      (items) => { setOwnedByMe(items); setError(null) },
      (cause) => setError(cause.message),
    )
  }, [uid, classIdsKey])

  const visible = useMemo(() => {
    const seen = new Set<string>()
    return [...ownedByMe, ...sharedWithMe].filter((graph) => {
      const key = `${graph.classId}/${graph.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return selectedClassId === 'all' || graph.classId === selectedClassId
    })
  }, [ownedByMe, sharedWithMe, selectedClassId])

  async function confirmDelete() {
    if (!deleteSelection) return
    const graph = deleteSelection
    const key = `${graph.classId}/${graph.id}`
    setDeletingKey(key)
    setDeleteError(null)
    try {
      await deleteSharedGraph(graph.classId, graph.id)
      setDeleteSelection(null)
      showToast('success', `“${graph.title}” was deleted.`)
      if (activeGraphId === graph.id) {
        const next = new URLSearchParams(searchParams)
        next.set('tab', 'graph')
        next.set('classId', graph.classId)
        next.delete('graphId')
        setSearchParams(next)
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The graph view could not be deleted.'
      setDeleteError(message)
      showToast('error', message)
    } finally {
      setDeletingKey(null)
    }
  }

  if (error) return <Alert tone="error" label="Could not load saved graph views">{error}</Alert>
  // Inside a graph view, the open graph's class decides which views are listed, so every view stays reachable.
  if (visible.length === 0) return null

  return (
    <>
      <section aria-labelledby="shared-graph-views-heading" className="grid gap-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <span className="section-kicker">SAVED GRAPH VIEWS</span>
            <h2 id="shared-graph-views-heading" className="m-0 text-xl font-bold text-navy-900">Graph views</h2>
            <p className="m-0 mt-1 text-sm text-navy-800">Open a saved view, or manage one you own.</p>
          </div>
          <Badge>{visible.length} {visible.length === 1 ? 'view' : 'views'}</Badge>
        </div>
        {deleteError && <Alert tone="error" label="Could not delete graph view">{deleteError}</Alert>}
        <ul className="m-0 grid list-none gap-3 p-0">
          {visible.map((graph) => {
            const isActive = graph.id === activeGraphId
            const key = `${graph.classId}/${graph.id}`
            const busy = deletingKey === key
            return (
              <li key={key}>
                <article className="grid gap-4 rounded-2xl border border-navy-900-12 bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-navy-900 text-white" aria-hidden="true">
                      <Network size={20} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="m-0 break-words text-base font-bold text-navy-900">{graph.title}</h3>
                        <Badge>{roleLabel(graph.role)}</Badge>
                        {isActive && <Badge><Eye size={13} aria-hidden="true" /> Open now</Badge>}
                      </div>
                      <p className="m-0 mt-1 text-sm text-navy-800">
                        {graph.nodeIds.length} {graph.nodeIds.length === 1 ? 'item' : 'items'} · {graph.role === 'owner' ? 'Saved by you' : `Shared by ${graph.ownerName}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isActive || busy}
                      aria-current={isActive ? 'true' : undefined}
                      onClick={() => {
                        const next = new URLSearchParams(searchParams)
                        next.set('tab', 'graph')
                        next.set('classId', graph.classId)
                        next.set('graphId', graph.id)
                        setSearchParams(next)
                      }}
                    >
                      {isActive ? 'Viewing' : 'Open graph'}
                    </Button>
                    {graph.role === 'owner' && (
                      <Button
                        type="button"
                        variant="secondary"
                        className="button--destructive"
                        disabled={busy}
                        aria-label={`Delete ${graph.title}`}
                        onClick={() => { setDeleteError(null); setDeleteSelection(graph) }}
                      >
                        {busy ? <LoaderCircle size={17} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Trash2 size={17} aria-hidden="true" />}
                        {busy ? 'Deleting…' : 'Delete'}
                      </Button>
                    )}
                  </div>
                </article>
              </li>
            )
          })}
        </ul>
      </section>
      <ConfirmDialog
        key={deleteSelection ? `${deleteSelection.classId}/${deleteSelection.id}` : 'closed'}
        open={Boolean(deleteSelection)}
        onClose={() => setDeleteSelection(null)}
        onConfirm={() => { void confirmDelete() }}
        title="Delete this graph view?"
        description={deleteSelection ? `“${deleteSelection.title}” and its saved collaboration data will be permanently deleted. Everyone with access will lose access to this graph view.` : ''}
        confirmLabel="Delete graph view"
        requiredName={deleteSelection?.title}
        busy={deletingKey !== null}
        closeOnConfirm={false}
      />
    </>
  )
}
