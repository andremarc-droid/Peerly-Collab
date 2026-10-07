import { useEffect, useState } from 'react'
import { watchCanvas } from '../services'
import type { LearningCanvasWithId } from '../types'
import { canEditCanvas, hasSocialAccess, resolveAccess, type ResolvedAccess } from './access'
import { watchMyRole } from './memberService'
import type { CollabRole } from './types'

export interface CanvasAccessState {
  canvas: LearningCanvasWithId | null
  access: ResolvedAccess
  /** The person's own invited role, if any. */
  role: CollabRole | null
  canEdit: boolean
  /** Presence, people and activity exist for the owner and invited people only. */
  social: boolean
  loading: boolean
  error: string | null
}

/**
 * Live view of one canvas and of what the signed-in person may do on it. It follows the owner changing
 * a role or removing someone, so the page can switch between "can edit" and "view only" immediately.
 */
export function useCanvasAccess(classId: string | undefined, canvasId: string | undefined, uid: string | undefined): CanvasAccessState {
  const key = `${classId}/${canvasId}/${uid}`
  const [canvasState, setCanvasState] = useState<{ key: string; canvas: LearningCanvasWithId | null; error: string | null }>({
    key: '',
    canvas: null,
    error: null,
  })
  const [roleState, setRoleState] = useState<{ key: string; role: CollabRole | null }>({ key: '', role: null })

  useEffect(() => {
    if (!classId || !canvasId) return undefined
    return watchCanvas(
      classId,
      canvasId,
      (canvas) => setCanvasState({ key, canvas, error: null }),
      (error) => setCanvasState({ key, canvas: null, error: error.message }),
    )
  }, [classId, canvasId, key])

  useEffect(() => {
    if (!classId || !canvasId || !uid) return undefined
    return watchMyRole(
      classId,
      canvasId,
      uid,
      (role) => setRoleState({ key, role }),
      () => setRoleState({ key, role: null }),
    )
  }, [classId, canvasId, uid, key])

  const canvasReady = canvasState.key === key
  const roleReady = roleState.key === key
  const canvas = canvasReady ? canvasState.canvas : null
  const role = roleReady ? roleState.role : null
  const access = resolveAccess({ canvas, uid, role })

  return {
    canvas,
    access,
    role,
    canEdit: canEditCanvas(access),
    social: hasSocialAccess(access, role),
    loading: Boolean(classId && canvasId && uid) && !(canvasReady && roleReady),
    error: canvasReady ? canvasState.error : null,
  }
}
