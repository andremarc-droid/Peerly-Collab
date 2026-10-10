import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useToast } from '../../shared/ui/useToast'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Skeleton } from '../../shared/ui/Skeleton'
import { GameLeaderboard } from './components/GameLeaderboard'
import { GameLobby } from './components/GameLobby'
import { GameQuestionView } from './components/GameQuestionView'
import { advanceQuestion, deleteGame, describeGameError, endGame, kickPlayer, startGame, submitAnswer } from './services'
import { useAutoReveal, useGameSession, useOnline, useSecondsLeft } from './useGameSession'
import type { GamePlayer } from './types'

const LEARNING_HOME = '/student/learning'

/** One screen for the whole game. The host and the players see different controls but the same live state. */
export function GamePage() {
  const { gameId = '' } = useParams()
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const online = useOnline()
  const session = useGameSession(gameId)
  const { game, players, current, reveal } = session
  const meUid = user?.uid ?? ''
  const isHost = game !== null && game.hostId === meUid
  const secondsLeft = useSecondsLeft(game?.status === 'question' && current ? current.endsAtMs : null)
  useAutoReveal(session, isHost)
  const [picked, setPicked] = useState<{ questionIndex: number; option: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<'end' | 'delete' | GamePlayer | null>(null)
  const leave = () => navigate(LEARNING_HOME)

  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true); setError('')
    try { await action(); return true } catch (cause) { setError(describeGameError(cause)); return false } finally { setBusy(false); setConfirm(null) }
  }
  const copyCode = async () => {
    if (!game) return
    try { await navigator.clipboard.writeText(game.code); showToast('success', 'Game code copied.') } catch { showToast('error', 'Could not copy the code.') }
  }
  const answer = (option: number) => {
    if (!current) return
    const questionIndex = current.questionIndex
    setPicked({ questionIndex, option })
    void run(async () => {
      try {
        const result = await submitAnswer(gameId, questionIndex, option)
        if (!result.accepted) throw new Error('Too late. Your answer was not counted.')
      } catch (cause) { setPicked(null); throw cause }
    })
  }

  if (session.loading) return <main className="mx-auto grid w-full max-w-3xl gap-4 p-4" aria-busy="true"><Skeleton className="h-24 rounded-2xl"/><Skeleton className="h-48 rounded-2xl"/></main>
  if (session.error) return <main className="mx-auto grid w-full max-w-3xl gap-4 p-4"><Alert tone="error" label="Could not load the game">{session.error}</Alert><Button variant="secondary" onClick={leave}>Back to Learning</Button></main>
  if (session.gone || !game) return <main className="mx-auto w-full max-w-3xl p-4"><EmptyState title="This game is not available" description="It may have ended, expired, or you were removed from it." action={<Button onClick={leave}>Back to Learning</Button>}/></main>
  if (game.expiresAtMs < Date.now() && game.status !== 'finished') return <main className="mx-auto w-full max-w-3xl p-4"><EmptyState title="This game has expired" description="Games close after a few hours. Start a new one to play again." action={<Button onClick={leave}>Back to Learning</Button>}/></main>

  const chosen = picked && current && picked.questionIndex === current.questionIndex ? picked.option : null
  const kicking = confirm !== null && typeof confirm === 'object' ? confirm : null
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-4 p-4">
      {!online && <Alert tone="warning" label="You are offline">Reconnect to keep playing. Your place in the game is saved.</Alert>}
      {error && <Alert tone="error" label="Game action failed">{error}</Alert>}
      {game.status === 'lobby' && <GameLobby game={game} players={players} isHost={isHost} busy={busy} onCopy={() => void copyCode()} onStart={() => void run(() => startGame(gameId))} onKick={setConfirm}/>}
      {(game.status === 'question' || game.status === 'reveal') && (current
        ? <GameQuestionView game={game} current={current} reveal={reveal} players={players} isHost={isHost} meUid={meUid} busy={busy} secondsLeft={secondsLeft} chosen={chosen} onAnswer={answer} onNext={() => void run(() => advanceQuestion(gameId))}/>
        : <Skeleton className="h-48 rounded-2xl"/>)}
      {game.status === 'finished' && (
        <section className="grid gap-4" aria-labelledby="results-title">
          <h2 id="results-title" className="m-0 text-2xl font-bold text-navy-900">Final results</h2>
          <GameLeaderboard players={players} meUid={meUid} title="Final standings"/>
        </section>
      )}
      <div className="flex flex-wrap gap-2">
        {isHost && (game.status === 'question' || game.status === 'reveal') && <Button variant="secondary" disabled={busy} onClick={() => setConfirm('end')}>End game now</Button>}
        {isHost && game.status === 'finished' && <Button variant="secondary" disabled={busy} onClick={() => setConfirm('delete')}>Delete game</Button>}
        <Button variant="tertiary" onClick={leave}>{game.status === 'finished' ? 'Back to Learning' : 'Leave'}</Button>
      </div>
      <ConfirmDialog open={confirm === 'end'} title="End the game now?" description="Players will see the final results for the questions played so far." confirmLabel="End game" onClose={() => setConfirm(null)} onConfirm={() => void run(() => endGame(gameId))}/>
      <ConfirmDialog open={confirm === 'delete'} title="Delete this game?" description="The results will be removed for everyone." confirmLabel="Delete game" onClose={() => setConfirm(null)} onConfirm={() => void run(() => deleteGame(gameId)).then(ok => { if (ok) leave() })}/>
      <ConfirmDialog open={kicking !== null} title="Remove this player?" description={kicking ? `${kicking.displayName} will be removed and cannot rejoin this game.` : ''} confirmLabel="Remove player" onClose={() => setConfirm(null)} onConfirm={() => kicking && void run(() => kickPlayer(gameId, kicking.uid))}/>
    </main>
  )
}
