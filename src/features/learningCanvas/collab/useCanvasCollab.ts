import { useEffect, useMemo, useState } from 'react'
import { buildPeople, visibleCursors } from './presence'
import { watchActivity } from './activityService'
import { watchInvites } from './inviteService'
import { watchMembers } from './memberService'
import { usePresence } from './usePresence'
import type { ActivityRecord, CollabPerson, InviteView, MemberView, RemoteCursor } from './types'

interface UseCanvasCollabOptions {
  classId: string
  canvasId: string
  uid: string
  name: string
  ownerId: string
  enabled: boolean
  owner: boolean
}

export function useCanvasCollab({
  classId,
  canvasId,
  uid,
  name,
  ownerId,
  enabled,
  owner,
}: UseCanvasCollabOptions) {
  const [members, setMembers] = useState<MemberView[]>([])
  const [invites, setInvites] = useState<InviteView[]>([])
  const [activity, setActivity] = useState<ActivityRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const { presence, nowMs, publishCursor, error: presenceError } = usePresence({ classId, canvasId, uid, name, enabled })

  useEffect(() => {
    if (!enabled) return undefined
    const fail = (cause: Error) => setError(cause.message)
    const unsubs = [
      watchMembers(classId, canvasId, setMembers, fail),
      watchActivity(classId, canvasId, setActivity, fail),
    ]
    if (owner) unsubs.push(watchInvites(classId, canvasId, setInvites, fail))
    return () => unsubs.forEach((unsubscribe) => unsubscribe())
  }, [classId, canvasId, enabled, owner])

  const people = useMemo<CollabPerson[]>(
    () => buildPeople({ ownerId, members, presence, nowMs, selfUid: uid, selfName: name }),
    [members, name, nowMs, ownerId, presence, uid],
  )
  const cursors = useMemo<RemoteCursor[]>(() => visibleCursors(presence, nowMs, uid), [nowMs, presence, uid])

  return { members, invites, activity, people, cursors, publishCursor, error: error ?? presenceError }
}
