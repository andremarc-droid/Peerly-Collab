import { useEffect, useState } from 'react'
import { getCanvas } from '../services'
import { watchSharedWithMe } from './memberService'
import type { CollabRole } from './types'
import type { LearningCanvasWithId } from '../types'

export interface SharedCanvas extends LearningCanvasWithId {
  shareRole: CollabRole
}

export function useSharedCanvases(uid: string | undefined) {
  const [state, setState] = useState<{ uid: string; items: SharedCanvas[]; error: string | null }>({
    uid: '',
    items: [],
    error: null,
  })

  useEffect(() => {
    if (!uid) return undefined
    let active = true
    let request = 0
    const unsubscribe = watchSharedWithMe(
      uid,
      (refs) => {
        const currentRequest = ++request
        void Promise.all(refs.map(async (ref) => {
          const canvas = await getCanvas(ref.classId, ref.canvasId)
          return canvas ? { ...canvas, shareRole: ref.role } : null
        })).then((items) => {
          if (active && currentRequest === request) {
            setState({ uid, items: items.filter((item): item is SharedCanvas => item !== null), error: null })
          }
        }).catch((cause: unknown) => {
          if (active && currentRequest === request) setState({
            uid,
            items: [],
            error: cause instanceof Error ? cause.message : 'Could not load shared canvases.',
          })
        })
      },
      (cause) => {
        if (active) {
          request += 1
          setState({ uid, items: [], error: cause.message })
        }
      },
    )
    return () => {
      active = false
      unsubscribe()
    }
  }, [uid])

  return state.uid === uid ? state : { uid: uid ?? '', items: [], error: null }
}
