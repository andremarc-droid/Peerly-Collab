import { useEffect, useRef, useState } from 'react'
import { secondsLeft, answeredCount } from './schemas'
import { syncGame, watchCurrentQuestion, watchGame, watchPlayers, watchReveal } from './services'
import { GAME_LIMITS_GRACE_MS } from './timing'
import type { CurrentQuestion, Game, GamePlayer, RevealState } from './types'

export interface GameSession {
  game: Game | null
  players: GamePlayer[]
  current: CurrentQuestion | null
  reveal: RevealState | null
  loading: boolean
  /** The game is gone, was deleted, or this person lost access (for example they were removed). */
  gone: boolean
  error: string | null
}

const isDenied = (cause: Error) => (cause as { code?: string }).code === 'permission-denied'

/** Subscribes to everything the screen needs and unsubscribes on unmount or when the game changes. */
export function useGameSession(gameId: string): GameSession {
  const [state, setState] = useState<GameSession>({ game: null, players: [], current: null, reveal: null, loading: true, gone: false, error: null })
  useEffect(() => {
    setState({ game: null, players: [], current: null, reveal: null, loading: true, gone: false, error: null })
    const fail = (cause: Error) => setState(old => (isDenied(cause) ? { ...old, loading: false, gone: true } : { ...old, loading: false, error: cause.message }))
    const stops = [
      watchGame(gameId, game => setState(old => ({ ...old, game, loading: false, gone: game === null, error: null })), fail),
      watchPlayers(gameId, players => setState(old => ({ ...old, players })), fail),
      watchCurrentQuestion(gameId, current => setState(old => ({ ...old, current })), fail),
      watchReveal(gameId, reveal => setState(old => ({ ...old, reveal })), fail),
    ]
    return () => stops.forEach(stop => stop())
  }, [gameId])
  return state
}

/** Whole seconds left until the server's end time. Ticks four times a second so the display never lags by more than a moment. */
export function useSecondsLeft(endsAtMs: number | null): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (endsAtMs === null) return undefined
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [endsAtMs])
  return endsAtMs === null ? null : secondsLeft(endsAtMs, now)
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

/**
 * Asks the server to reveal once the deadline has passed or everyone answered. The server decides, so asking early is
 * harmless. Asks are spaced out, and players wait a random moment so 30 phones do not all call at the same instant.
 */
export function useAutoReveal(session: GameSession, isHost: boolean): void {
  const lastAsk = useRef(0)
  const { game, current, players } = session
  useEffect(() => {
    if (!game || game.status !== 'question' || !current) return undefined
    const timer = window.setInterval(() => {
      const now = Date.now()
      const timeUp = now >= current.endsAtMs + GAME_LIMITS_GRACE_MS
      const everyone = players.length > 0 && answeredCount(players, current.questionIndex) >= players.length
      if (!timeUp && !everyone) return
      if (now - lastAsk.current < 3000 + (isHost ? 0 : Math.random() * 1500)) return
      lastAsk.current = now
      void syncGame(game.id).catch(() => undefined)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [game?.id, game?.status, current?.questionIndex, current?.endsAtMs, players, isHost])
}
