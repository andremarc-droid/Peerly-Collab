import type { LearningCanvasRecord } from '../types'
import type { CanvasAccess, CollabRole } from './types'

export type ResolvedAccess = CanvasAccess | 'none'

interface ResolveAccessInput {
  canvas: Pick<LearningCanvasRecord, 'ownerId' | 'kind' | 'status'> | null
  uid: string | null | undefined
  /** The person's own member record, or null when they were never invited (or were removed). */
  role: CollabRole | null
}

/**
 * Decides what one person may do on one canvas. The rules enforce the same thing on the server;
 * this only decides what the interface offers, so it never grants more than the rules would.
 *
 *  - the owner always has full control
 *  - an invited person gets exactly the role the owner chose
 *  - other class members can read a published class canvas, view only
 *  - everyone else has no access
 */
export function resolveAccess({ canvas, uid, role }: ResolveAccessInput): ResolvedAccess {
  if (!canvas || !uid) return 'none'
  if (canvas.ownerId === uid) return 'owner'
  if (role) return role
  if (canvas.kind === 'class' && canvas.status === 'published') return 'viewer'
  return 'none'
}

export function canEditCanvas(access: ResolvedAccess): boolean {
  return access === 'owner' || access === 'editor'
}

/** Presence, people and the activity log exist for the owner and invited people only. */
export function hasSocialAccess(access: ResolvedAccess, role: CollabRole | null): boolean {
  return access === 'owner' || role !== null
}

export const ACCESS_LABEL: Record<CanvasAccess, string> = {
  owner: 'Owner',
  editor: 'Can edit',
  viewer: 'View only',
}
