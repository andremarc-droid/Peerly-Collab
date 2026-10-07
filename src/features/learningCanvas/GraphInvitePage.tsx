import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../../app/AppShell'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { PageHeader } from '../../shared/ui/PageHeader'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useAuth } from '../auth/useAuth'
import { acceptGraphInvite } from './graph/sharing'

export function GraphInvitePage() {
  const { classId, graphId, token } = useParams<{ classId: string; graphId: string; token: string }>()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const started = useRef(false)
  const [error, setError] = useState<string | null>(null)

  const join = useCallback(async () => {
    if (!classId || !graphId || !token || !user || !profile?.role) return
    setError(null)
    try {
      const name = user.displayName || user.email || 'Learner'
      await acceptGraphInvite(classId, graphId, token, user.uid, name)
      const prefix = profile.role === 'instructor' ? '/instructor' : '/student'
      navigate(`${prefix}/learning?tab=graph&classId=${encodeURIComponent(classId)}&graphId=${encodeURIComponent(graphId)}`, { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not accept this graph invite.')
    }
  }, [classId, graphId, token, user, profile, navigate])

  useEffect(() => {
    if (started.current || !user || !profile?.role) return
    started.current = true
    void join()
  }, [join, user, profile])

  return (
    <AppShell>
      <PageHeader eyebrow="LEARNING GRAPH" title="Joining shared graph" subtitle="Checking your invite code and access…" />
      <main className="app-shell__content grid gap-4">
        {error ? (
          <>
            <Alert tone="error" label="Could not join this graph">{error}</Alert>
            <Button variant="secondary" onClick={() => void join()}>Try again</Button>
            <Button variant="tertiary" to={profile?.role === 'instructor' ? '/instructor/learning' : '/student/learning'}>Back to Learning</Button>
          </>
        ) : <Skeleton className="h-24 rounded-2xl" label="Accepting graph invite" />}
      </main>
    </AppShell>
  )
}
