import { useCallback, useEffect, useRef, useState } from 'react'
import { CURSOR_THROTTLE_MS, HEARTBEAT_MS, PRESENCE_TICK_MS } from './constants'
import { watchPresence, writePresence } from './presenceService'
import type { CursorPosition, PresenceRecord } from './types'

interface UsePresenceOptions {
  classId: string
  canvasId: string
  uid: string
  name: string
  /** False when this person has no social access (the rules would refuse the writes). */
  enabled: boolean
}

const EMPTY: ReadonlyMap<string, PresenceRecord> = new Map()

/**
 * Tells everyone else "I am here" and listens for the same from them.
 *
 *  - a heartbeat every 20 s keeps me "active"; three missed beats and I read as offline
 *  - a hidden tab or closing the page marks me offline straight away (best effort; the heartbeat
 *    timeout covers a crash or a lost connection)
 *  - the pointer position is published at most once a second and only when it changed
 */
export function usePresence({ classId, canvasId, uid, name, enabled }: UsePresenceOptions) {
  const key = `${classId}/${canvasId}`
  const [watched, setWatched] = useState<{ key: string; presence: ReadonlyMap<string, PresenceRecord> }>({
    key: '',
    presence: EMPTY,
  })
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)

  const cursorRef = useRef<CursorPosition | null>(null)
  const lastSentCursorRef = useRef<CursorPosition | null>(null)
  const lastSentAtRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendRef = useRef<(online: boolean) => void>(() => {})

  useEffect(() => {
    sendRef.current = (online: boolean) => {
      lastSentAtRef.current = Date.now()
      lastSentCursorRef.current = cursorRef.current
      void writePresence(classId, canvasId, { uid, name, online, cursor: cursorRef.current }).then(
        () => setError(null),
        (cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not update presence.'),
      )
    }
  }, [classId, canvasId, uid, name])

  useEffect(() => {
    if (!enabled) return undefined
    return watchPresence(
      classId,
      canvasId,
      (presence) => setWatched({ key, presence }),
      (cause) => {
        setWatched({ key, presence: EMPTY })
        setError(cause.message)
      },
    )
  }, [enabled, classId, canvasId, key])

  useEffect(() => {
    if (!enabled) return undefined
    const visible = () => document.visibilityState !== 'hidden'
    const send = (online: boolean) => sendRef.current(online)

    if (visible()) send(true)
    const beat = window.setInterval(() => {
      if (visible()) send(true)
    }, HEARTBEAT_MS)
    const tick = window.setInterval(() => setNowMs(Date.now()), PRESENCE_TICK_MS)

    const onVisibility = () => send(visible())
    const onPageHide = () => send(false)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)

    return () => {
      window.clearInterval(beat)
      window.clearInterval(tick)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      cursorRef.current = null
      send(false)
    }
  }, [enabled, classId, canvasId, uid])

  const publishCursor = useCallback((position: CursorPosition | null) => {
    cursorRef.current = position
    const last = lastSentCursorRef.current
    const unchanged = last === position || (last && position && last.x === position.x && last.y === position.y)
    if (unchanged || document.visibilityState === 'hidden') return

    const wait = CURSOR_THROTTLE_MS - (Date.now() - lastSentAtRef.current)
    if (wait <= 0) {
      sendRef.current(true)
    } else if (!timerRef.current) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        sendRef.current(true)
      }, wait)
    }
  }, [])

  const presence = enabled && watched.key === key ? watched.presence : EMPTY
  return { presence, nowMs, publishCursor, error }
}
