import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../../app/AppShell'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { PageHeader } from '../../shared/ui/PageHeader'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useAuth } from '../auth/useAuth'
import { acceptDeckInvite } from './sharing'

export function DeckInvitePage() {
  const { classId, deckId, token } = useParams<{ classId: string; deckId: string; token: string }>()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const startedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)

  const join = useCallback(async () => {
    if (!classId || !deckId || !token || !user || !profile?.role) return
    setError(null)
    try {
      await acceptDeckInvite(classId, deckId, token, user.uid, user.displayName || user.email)
      const prefix = profile.role === 'instructor' ? '/instructor' : '/student'
      navigate(`${prefix}/learning?tab=flashcards&classId=${encodeURIComponent(classId)}`, { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not accept this invite.')
    }
  }, [classId, deckId, navigate, profile, token, user])

  useEffect(() => {
    if (startedRef.current || !user || !profile?.role) return
    startedRef.current = true
    void join()
  }, [join, user, profile])

  return (
    <AppShell>
      <PageHeader eyebrow="FLASHCARDS" title="Joining shared deck" subtitle="Checking your invite and class access…" />
      <main className="app-shell__content grid gap-4">
        {error ? (
          <>
            <Alert tone="error" label="Could not join this deck">{error}</Alert>
            <Button variant="secondary" onClick={() => void join()}>Try again</Button>
            <Button to={profile?.role === 'instructor' ? '/instructor/learning' : '/student/learning'} variant="tertiary">Back to Learning</Button>
          </>
        ) : (
          <Skeleton className="h-24 rounded-2xl" label="Accepting flashcard invite" />
        )}
      </main>
    </AppShell>
  )
}
