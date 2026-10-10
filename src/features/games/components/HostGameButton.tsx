import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { createGame, describeGameError } from '../services'
import { GAME_LIMITS, type GameSourceChoice } from '../types'

const CHOICES = [10, 15, 20, 30, 45, 60].filter(value => value >= GAME_LIMITS.minTimeSec && value <= GAME_LIMITS.maxTimeSec)

interface Props {
  source: GameSourceChoice
  groupId?: string | null
  disabled?: boolean
}

/** Picks the seconds per question, creates the game on the server and opens the host screen. */
export function HostGameButton({ source, groupId, disabled }: Props) {
  const navigate = useNavigate()
  const [seconds, setSeconds] = useState(20)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const host = async () => {
    setBusy(true); setError('')
    try {
      const result = await createGame({ source, timeLimitSec: seconds, groupId: groupId ?? null })
      navigate(`/learning/games/${result.gameId}`)
    } catch (cause) {
      setError(describeGameError(cause))
      setBusy(false)
    }
  }
  return (
    <div className="grid gap-3">
      <label className="field">
        <span className="field__label">Seconds per question</span>
        <select className="field__control" value={seconds} onChange={event => setSeconds(Number(event.target.value))}>
          {CHOICES.map(value => <option key={value} value={value}>{value} seconds</option>)}
        </select>
      </label>
      <Button type="button" disabled={busy || disabled} onClick={() => void host()}>{busy ? 'Creating game…' : 'Host live game'}</Button>
      {error && <Alert tone="error" label="Could not start a game">{error}</Alert>}
    </div>
  )
}
