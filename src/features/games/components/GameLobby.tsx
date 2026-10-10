import { Copy } from 'lucide-react'
import { Button } from '../../../shared/ui/Button'
import { GAME_LIMITS, type Game, type GamePlayer } from '../types'

interface Props {
  game: Game
  players: GamePlayer[]
  isHost: boolean
  busy: boolean
  onStart: () => void
  onKick: (player: GamePlayer) => void
  onCopy: () => void
}

export function GameLobby({ game, players, isHost, busy, onStart, onKick, onCopy }: Props) {
  return (
    <section className="grid gap-4" aria-labelledby="lobby-title">
      <div className="grid gap-2 rounded-3xl border border-navy-900-15 bg-white p-5 text-center shadow-sm">
        <h2 id="lobby-title" className="m-0 text-xl font-bold text-navy-900">{isHost ? 'Waiting for players' : 'You are in!'}</h2>
        <p className="m-0 text-base text-navy-900">{isHost ? 'Share this code so players can join.' : 'Waiting for the host to start the game.'}</p>
        <code className="mx-auto rounded-xl border border-navy-900-30 px-6 py-3 text-4xl font-bold tracking-widest text-navy-900" aria-label={`Game code ${game.code.split('').join(' ')}`}>{game.code}</code>
        {isHost && <div className="flex flex-wrap justify-center gap-2"><Button variant="secondary" onClick={onCopy}><Copy size={16} aria-hidden="true"/>Copy code</Button></div>}
        <p className="m-0 text-sm text-navy-900">{game.questionCount} questions · {game.timeLimitSec}s each</p>
      </div>
      <section className="rounded-3xl border border-navy-900-15 bg-white p-5" aria-label="Players">
        <h3 className="m-0 text-lg font-bold text-navy-900">Players ({players.length}/{GAME_LIMITS.maxPlayers})</h3>
        {players.length ? (
          <ul className="m-0 mt-3 grid list-none gap-2 p-0">
            {players.map(player => (
              <li key={player.uid} className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-navy-900-15 p-3 text-base text-navy-900">
                <span className="min-w-0 truncate">{player.displayName}</span>
                {isHost && <Button variant="tertiary" disabled={busy} aria-label={`Remove ${player.displayName}`} onClick={() => onKick(player)}>Remove</Button>}
              </li>
            ))}
          </ul>
        ) : <p className="m-0 mt-2 text-base text-navy-900">Nobody has joined yet.</p>}
      </section>
      {isHost && <Button disabled={busy || players.length === 0} onClick={onStart}>Start game</Button>}
    </section>
  )
}
