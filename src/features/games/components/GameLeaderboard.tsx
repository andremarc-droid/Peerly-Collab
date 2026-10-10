import { rankPlayers } from '../schemas'
import type { GamePlayer, RevealState } from '../types'

interface Props {
  players: GamePlayer[]
  meUid?: string
  /** When set, shows the points each player earned on the question that was just revealed. */
  reveal?: RevealState | null
  limit?: number
  title?: string
}

/** Names are rendered as text only. Equal scores share a rank. */
export function GameLeaderboard({ players, meUid, reveal, limit, title = 'Leaderboard' }: Props) {
  const ranked = rankPlayers(players)
  const shown = limit ? ranked.slice(0, limit) : ranked
  if (!shown.length) return <p className="m-0 text-base text-navy-900">No players yet.</p>
  return (
    <section aria-label={title} className="grid gap-2">
      <h3 className="m-0 text-lg font-bold text-navy-900">{title}</h3>
      <ol className="m-0 grid list-none gap-2 p-0">
        {shown.map(player => {
          const earned = reveal?.perPlayerPoints[player.uid]
          return (
            <li key={player.uid} className={`flex min-h-11 items-center gap-3 rounded-xl border p-3 text-base text-navy-900 ${player.uid === meUid ? 'border-navy-900 bg-navy-900-5' : 'border-navy-900-15'}`}>
              <span className="w-8 shrink-0 text-center font-bold" aria-label={`Rank ${player.rank}`}>{player.rank}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{player.displayName}{player.uid === meUid ? ' (you)' : ''}</span>
              {earned !== undefined && earned > 0 && <span className="shrink-0 text-sm">+{earned}</span>}
              <span className="shrink-0 font-bold">{player.score}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
