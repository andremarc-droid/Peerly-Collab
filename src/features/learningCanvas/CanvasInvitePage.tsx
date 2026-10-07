import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../../app/AppShell'
import { PageHeader } from '../../shared/ui/PageHeader'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useAuth } from '../auth/useAuth'
import { memberSummary } from './collab/activity'
import { logActivity } from './collab/activityService'
import { acceptInvite } from './collab/memberService'

export function CanvasInvitePage() {
  const { classId, canvasId, token } = useParams<{ classId: string; canvasId: string; token: string }>()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const startedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)

  const join = useCallback(async () => {
    if (!classId || !canvasId || !token || !user || !profile?.role) return
    setError(null)
    try {
      const result = await acceptInvite({
        classId,
        canvasId,
        token,
        uid: user.uid,
        displayName: user.displayName || user.email,
      })
      if (result.joined) {
        await logActivity(classId, canvasId, { uid: user.uid, name: user.displayName || user.email || 'Learner' }, {
          type: 'member',
          summary: memberSummary.joined(user.displayName || user.email || 'Learner', result.role),
        })
      }
      const prefix = profile.role === 'instructor' ? '/instructor' : '/student'
      navigate(`${prefix}/classes/${encodeURIComponent(classId)}/learning/${encodeURIComponent(canvasId)}`, { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not accept this invite.')
    }
  }, [canvasId, classId, navigate, profile, token, user])

  useEffect(() => {
    if (startedRef.current || !user || !profile?.role) return
    startedRef.current = true
    void join()
  }, [join, user, profile])

  return (
    <AppShell>
      <PageHeader eyebrow="LEARNING CANVAS" title="Joining shared canvas" subtitle="Checking your invite and access…" />
      <main className="app-shell__content grid gap-4">
        {error ? (
          <>
            <Alert tone="error" label="Could not join this canvas">{error}</Alert>
            <Button variant="secondary" onClick={() => void join()}>Try again</Button>
            <Button to={profile?.role === 'instructor' ? '/instructor/learning' : '/student/learning'} variant="tertiary">Back to Learning</Button>
          </>
        ) : (
          <Skeleton className="h-24 rounded-2xl" label="Accepting canvas invite" />
        )}
      </main>
    </AppShell>
  )
}
