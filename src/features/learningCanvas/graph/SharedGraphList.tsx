import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert } from '../../../shared/ui/Alert'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { DataCard } from '../../../shared/ui/DataCard'
import { watchOwnedGraphs, watchSharedGraphs, type SharedGraphRef } from './sharing'

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
  const [sharedWithMe, setSharedWithMe] = useState<SharedGraphRef[]>([])
  const [ownedByMe, setOwnedByMe] = useState<SharedGraphRef[]>([])
  const [error, setError] = useState<string | null>(null)
  const classIdsKey = classIds.join('|')

  useEffect(() => {
    setError(null)
    return watchSharedGraphs(uid, setSharedWithMe, (cause) => setError(cause.message))
  }, [uid])

  useEffect(() => {
    return watchOwnedGraphs(uid, classIdsKey ? classIdsKey.split('|') : [], setOwnedByMe, (cause) => setError(cause.message))
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

  if (error) return <Alert tone="error" label="Could not load saved graph views">{error}</Alert>
  // Inside a graph view, the open graph's class decides which views are listed, so every view stays reachable.
  if (visible.length === 0) return null

  return (
    <section aria-labelledby="shared-graph-views-heading" className="grid gap-3">
      <div>
        <span className="section-kicker">SAVED GRAPH VIEWS</span>
        <h2 id="shared-graph-views-heading" className="m-0 text-xl font-bold text-navy-900">Graph views</h2>
      </div>
      {visible.map((graph) => {
        const isActive = graph.id === activeGraphId
        return (
        <DataCard
          key={`${graph.classId}/${graph.id}`}
          title={graph.title}
          meta={`${graph.nodeIds.length} included materials · ${graph.role === 'owner' ? 'Saved by you' : `Shared by ${graph.ownerName}`}`}
          badge={<><Badge>{roleLabel(graph.role)}</Badge>{isActive && <Badge>Open now</Badge>}</>}
          actions={
            <Button
              type="button"
              variant="secondary"
              disabled={isActive}
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
          }
        />
        )
      })}
    </section>
  )
}
