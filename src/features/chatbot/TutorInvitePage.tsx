import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../../app/AppShell'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { PageHeader } from '../../shared/ui/PageHeader'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useAuth } from '../auth/useAuth'
import { acceptTutorInvite } from './sharedAccessService'

export function TutorInvitePage() {
  const { threadId, token } = useParams<{ threadId: string; token: string }>()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const started = useRef(false)
  const [error, setError] = useState<string | null>(null)

  const accept = useCallback(async () => {
    if (!threadId || !token || !user || !profile?.role) return
    setError(null)
    try {
      await acceptTutorInvite(threadId, token, user.uid, user.displayName || user.email)
      const route = profile.role === 'instructor' ? '/instructor/learning' : '/student/learning'
      navigate(`${route}?tab=tutor&thread=${encodeURIComponent(threadId)}`, { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not accept this conversation invite.')
    }
  }, [navigate, profile, threadId, token, user])

  useEffect(() => {
    if (started.current || !user || !profile?.role) return
    started.current = true
    void accept()
  }, [accept, profile, user])

  return (
    <AppShell>
      <PageHeader eyebrow="AI TUTOR" title="Joining shared conversation" subtitle="Checking your invite and access…" />
      <main className="app-shell__content grid gap-4">
        {error ? (
          <>
            <Alert tone="error" label="Could not join this conversation">{error}</Alert>
            <Button type="button" variant="secondary" onClick={() => void accept()}>Try again</Button>
            <Button to={profile?.role === 'instructor' ? '/instructor/learning' : '/student/learning'} variant="tertiary">Back to Learning</Button>
          </>
        ) : (
          <Skeleton className="h-24 rounded-2xl" label="Accepting conversation invite" />
        )}
      </main>
    </AppShell>
  )
}
