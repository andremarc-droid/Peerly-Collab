import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { useFlashcardDecks } from '../flashcards'
import { listLessonPlans } from '../lessons/services'
import type { LessonPlan } from '../lessons/types'
import { HostGroupGame } from './components/HostGroupGame'
import { JoinGameForm } from './components/JoinGameForm'
import { watchMyGameId } from './services'

/** Learning > Games: join with a code, host from your own material, or go back to a game you are in. */
export function GamesTab() {
  const { user } = useAuth()
  const [plans, setPlans] = useState<LessonPlan[]>([])
  const [planError, setPlanError] = useState('')
  const [hostingId, setHostingId] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const { decks } = useFlashcardDecks({ role: 'student', uid: user?.uid, classIds: user?.uid ? [user.uid] : [] })
  useEffect(() => {
    if (!user) return undefined
    let active = true
    void listLessonPlans(user.uid).then(items => { if (active) setPlans(items) }).catch(cause => { if (active) setPlanError(cause instanceof Error ? cause.message : 'Could not load lesson plans.') })
    return () => { active = false }
  }, [user?.uid])
  useEffect(() => {
    if (!user) return undefined
    // A missing or unreadable pointer just means there is nothing to resume.
    const stops = [
      watchMyGameId('host', user.uid, setHostingId, () => setHostingId(null)),
      watchMyGameId('player', user.uid, setPlayingId, () => setPlayingId(null)),
    ]
    return () => stops.forEach(stop => stop())
  }, [user?.uid])
  const resume = hostingId ?? playingId
  return (
    <div className="grid gap-4">
      {resume && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-navy-900-15 bg-white p-5 shadow-sm" aria-label="Game in progress">
          <p className="m-0 text-base font-semibold text-navy-900">{hostingId ? 'You are hosting a game.' : 'You are in a game.'}</p>
          <Button to={`/learning/games/${resume}`}>Return to game</Button>
        </section>
      )}
      <div className="rounded-3xl border border-navy-900-15 bg-white p-5 shadow-sm"><JoinGameForm/></div>
      {planError && <Alert tone="warning" label="Lesson plans unavailable">{planError}</Alert>}
      <HostGroupGame decks={decks} plans={plans}/>
    </div>
  )
}
