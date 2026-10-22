import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '../../../app/AppShell'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { PageHeader } from '../../../shared/ui/PageHeader'
import { Skeleton } from '../../../shared/ui/Skeleton'
import { useAuth } from '../../auth/useAuth'
import { getQuiz, type QuizRecord } from '../../quizzes/services/quizService'
import { watchMyTeamId, watchReveals, watchTeam, watchTeamSession } from '../../quizzes/services/teamService'
import type { GroupParticipation } from '../../quizzes/types'
import type { Team, TeamReveal, TeamSession } from '../../quizzes/types/team'
import { TeamEntry } from './TeamEntry'
import { TeamLobby } from './TeamLobby'
import { TeamPlay } from './TeamPlay'
import { TeamResults } from './TeamResults'
import { estimateClockOffsetMs } from './teamPlayLogic'

type LoadedQuiz = { quiz: QuizRecord; group: GroupParticipation }

/**
 * Student entry for a group quiz. The student reads only their team, the current question and finished reveals, never the question list or answer keys.
 * Students reach this page from QuizIntroPage, which sends group quizzes here before it tries to load questions.
 */
export function GroupQuizPage() {
  const { quizId = '' } = useParams()
  const { user } = useAuth()
  const [loaded, setLoaded] = useState<LoadedQuiz | null>(null)
  const [quizError, setQuizError] = useState('')
  const [teamId, setTeamId] = useState<string | null | undefined>(undefined)
  const [watchError, setWatchError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const uid = user?.uid

  useEffect(() => {
    if (!uid || !quizId) return undefined
    let live = true
    void getQuiz(quizId).then(found => {
      if (!live) return
      if (!found || found.status !== 'published') { setQuizError('This quiz is no longer available.'); return }
      if (found.settings.participation.type !== 'group') { setQuizError('This is not a group quiz.'); return }
      setQuizError(''); setLoaded({ quiz: found, group: found.settings.participation })
    }).catch((reason: unknown) => { if (live) setQuizError(reason instanceof Error ? reason.message : 'The quiz could not be loaded.') })
    return () => { live = false }
  }, [uid, quizId, attempt])

  useEffect(() => {
    if (!uid || !quizId) return undefined
    return watchMyTeamId(uid, quizId, id => { setTeamId(id); setWatchError('') }, reason => setWatchError(reason.message || 'Your team could not be loaded.'))
  }, [uid, quizId, attempt])

  const retry = <Button type="button" variant="secondary" onClick={() => { setQuizError(''); setWatchError(''); setTeamId(undefined); setAttempt(count => count + 1) }}>Retry</Button>
  const shell = (title: string, body: React.ReactNode) => <AppShell><PageHeader eyebrow="GROUP QUIZ" title={title} subtitle="Work through the questions together with your team." /><main className="app-shell__content grid gap-5" id="main-content">{body}</main></AppShell>

  if (quizError) return shell('Quiz unavailable.', <><Alert tone="error" label="Quiz unavailable" action={retry}>{quizError}</Alert><Button to="/student" variant="secondary">Back to practice</Button></>)
  if (watchError) return shell('Team unavailable.', <Alert tone="error" label="Your team could not be loaded" action={retry}>{watchError}</Alert>)
  if (!user || !loaded || teamId === undefined) return <AppShell><main className="app-shell__content"><Skeleton className="h-72 rounded-3xl" label="Loading group quiz" /></main></AppShell>

  const { quiz, group } = loaded
  return shell(`${quiz.title}.`, teamId === null
    ? <TeamEntry quizId={quiz.id} uid={user.uid} teamFormation={group.teamFormation} groupSize={group.groupSize} />
    : <TeamRoom key={teamId} quiz={quiz} teamId={teamId} uid={user.uid} settings={group} />)
}

const subscribeOnline = (notify: () => void) => {
  window.addEventListener('online', notify); window.addEventListener('offline', notify)
  return () => { window.removeEventListener('online', notify); window.removeEventListener('offline', notify) }
}

interface TeamRoomProps { quiz: QuizRecord; teamId: string; uid: string; settings: GroupParticipation }

/** Watches one team. Remounted (by key) whenever the student's team changes, so nothing from an old team leaks into a new one. */
function TeamRoom({ quiz, teamId, uid, settings }: TeamRoomProps) {
  const quizId = quiz.id
  const [team, setTeam] = useState<Team | null | undefined>(undefined)
  const [session, setSession] = useState<TeamSession | null | undefined>(undefined)
  const [reveals, setReveals] = useState<TeamReveal[]>([])
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const offset = useRef(0)
  const lastStamp = useRef<number | null>(null)
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
  const getNow = useCallback(() => Date.now() + offset.current, [])

  useEffect(() => {
    const fail = (reason: Error) => setError(reason.message || 'The team could not be loaded.')
    const stops = [
      watchTeam(quizId, teamId, next => { setTeam(next); setError('') }, fail),
      watchTeamSession(quizId, teamId, next => {
        // A question seen opening live gives a fair sample of the server clock. Later updates to the same question do not.
        if (next && next.questionStartedAt !== lastStamp.current) {
          lastStamp.current = next.questionStartedAt
          const sample = estimateClockOffsetMs(next.questionStartedAt, Date.now())
          if (sample !== null) offset.current = sample
        }
        setSession(next)
      }, fail),
      watchReveals(quizId, teamId, setReveals, fail),
    ]
    return () => stops.forEach(stop => stop())
  }, [quizId, teamId, attempt])

  if (error) return <Alert tone="error" label="Your team could not be updated" action={<Button type="button" variant="secondary" onClick={() => { setError(''); setAttempt(count => count + 1) }}>Retry</Button>}>{error}</Alert>
  if (team === undefined) return <Skeleton className="h-72 rounded-3xl" label="Loading your team" />
  if (team === null) return <EmptyState title="This team no longer exists" description="Your instructor may have changed the teams. Go back and check again." action={<Button to="/student" variant="secondary">Back to practice</Button>} />

  return <>
    {!online && <Alert tone="warning" label="You are offline">Your answers cannot be sent until you reconnect. Nothing is lost on this screen.</Alert>}
    {team.status === 'submitted' ? <TeamResults team={team} reveals={reveals} quiz={quiz} />
      : team.status === 'in_progress' ? (
          session ? (
            <TeamPlay quizId={quizId} team={team} session={session} reveals={reveals} settings={settings} uid={uid} getNow={getNow} />
          ) : (
            <Skeleton className="h-72 rounded-3xl" label="Opening the first question" />
          )
        )
      : <TeamLobby quizId={quizId} team={team} settings={settings} uid={uid} />}
  </>
}
