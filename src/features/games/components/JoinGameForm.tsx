import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { Input } from '../../../shared/ui/Input'
import { describeGameError, joinGame } from '../services'
import { normalizeGameCode, validateJoinInput } from '../schemas'
import { GAME_LIMITS } from '../types'

/** Join a live game with its 6-character code. The name is what other players see. */
export function JoinGameForm() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [name, setName] = useState(profile?.displayName || user?.displayName || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => {
    const checked = validateJoinInput(code, name)
    if ('error' in checked) { setError(checked.error); return }
    setBusy(true); setError('')
    try {
      const result = await joinGame(checked.code, checked.displayName)
      navigate(`/learning/games/${result.gameId}`)
    } catch (cause) {
      setError(describeGameError(cause))
      setBusy(false)
    }
  }
  return (
    <form className="grid content-start gap-3" onSubmit={event => { event.preventDefault(); void submit() }}>
      <h2 className="m-0 text-xl font-bold text-navy-900">Join a live game</h2>
      <Input label="6-character game code" value={code} maxLength={GAME_LIMITS.codeLength + 2} autoComplete="off" autoCapitalize="characters" onChange={event => setCode(normalizeGameCode(event.target.value))}/>
      <Input label="Your name" value={name} maxLength={GAME_LIMITS.nameMax} onChange={event => setName(event.target.value)}/>
      <Button type="submit" disabled={busy || !code || !name.trim()}>{busy ? 'Joining…' : 'Join game'}</Button>
      {error && <Alert tone="error" label="Could not join the game">{error}</Alert>}
    </form>
  )
}
