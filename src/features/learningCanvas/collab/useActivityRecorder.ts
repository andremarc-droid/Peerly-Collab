import { useCallback, useEffect, useRef, useState } from 'react'
import type { LearningCanvasContent } from '../types'
import { diffBoards, mergeChanges, summarizeChanges, type BoardChange } from './activity'
import { logActivity } from './activityService'
import { ACTIVITY_FLUSH_MS } from './constants'

interface UseActivityRecorderOptions {
  classId: string
  canvasId: string
  uid: string
  name: string
  /** Only the owner and invited editors may write edit entries (the rules enforce it). */
  enabled: boolean
}

const MAX_BUFFERED_CHANGES = 60

/**
 * Collects what this person changed and writes it to the activity log as one entry per burst of work,
 * so typing in a card produces a single "Edited text card" line rather than one per autosave.
 * The log is best effort: a failed write never blocks editing.
 */
export function useActivityRecorder({ classId, canvasId, uid, name, enabled }: UseActivityRecorderOptions) {
  const [error, setError] = useState<string | null>(null)
  const bufferRef = useRef<BoardChange[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const identityRef = useRef({ classId, canvasId, uid, name, enabled })

  useEffect(() => {
    identityRef.current = { classId, canvasId, uid, name, enabled }
  }, [classId, canvasId, uid, name, enabled])

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const changes = bufferRef.current
    bufferRef.current = []
    const who = identityRef.current
    if (changes.length === 0 || !who.enabled) return
    const { summary, lines } = summarizeChanges(changes)
    void logActivity(who.classId, who.canvasId, { uid: who.uid, name: who.name }, {
      type: 'edit',
      summary,
      changes: lines,
    }).then(
      () => setError(null),
      (cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not record canvas activity.'),
    )
  }, [])

  const recordEdit = useCallback(
    (before: LearningCanvasContent, after: LearningCanvasContent) => {
      if (!identityRef.current.enabled) return
      const diff = diffBoards(before, after)
      if (diff.length === 0) return
      bufferRef.current = mergeChanges(bufferRef.current, diff)
      if (bufferRef.current.length >= MAX_BUFFERED_CHANGES) {
        flush()
      } else if (!timerRef.current) {
        timerRef.current = setTimeout(flush, ACTIVITY_FLUSH_MS)
      }
    },
    [flush],
  )

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [flush])

  return { recordEdit, flush, error }
}
