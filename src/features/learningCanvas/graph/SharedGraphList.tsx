import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert } from '../../../shared/ui/Alert'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { DataCard } from '../../../shared/ui/DataCard'
import { watchSharedGraphs, type SharedGraphRef } from './sharing'

interface SharedGraphListProps {
  uid: string
  selectedClassId: string
}

export function SharedGraphList({ uid, selectedClassId }: SharedGraphListProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [graphs, setGraphs] = useState<SharedGraphRef[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
    return watchSharedGraphs(uid, setGraphs, (cause) => setError(cause.message))
  }, [uid])

  const visible = graphs.filter((graph) => selectedClassId === 'all' || graph.classId === selectedClassId)

  if (error) return <Alert tone="error" label="Could not load shared graph views">{error}</Alert>
  if (visible.length === 0) return null

  return (
    <section aria-labelledby="shared-graph-views-heading" className="grid gap-3">
      <div>
        <span className="section-kicker">SHARED WITH YOU</span>
        <h2 id="shared-graph-views-heading" className="m-0 text-xl font-bold text-navy-900">Graph views</h2>
      </div>
      {visible.map((graph) => (
        <DataCard
          key={`${graph.classId}/${graph.id}`}
          title={graph.title}
          meta={`${graph.nodeIds.length} included materials · Shared by ${graph.ownerName}`}
          badge={<Badge>{graph.role === 'editor' ? 'Can edit' : 'View only'}</Badge>}
          actions={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const next = new URLSearchParams(searchParams)
                next.set('tab', 'graph')
                next.set('classId', graph.classId)
                next.set('graphId', graph.id)
                setSearchParams(next)
              }}
            >
              Open graph
            </Button>
          }
        />
      ))}
    </section>
  )
}
