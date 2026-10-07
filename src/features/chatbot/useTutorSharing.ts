import { useCallback, useEffect, useRef, useState } from 'react'
import type { useChatbot } from './useChatbot'
import {
  createSharedThread,
  syncSharedThread,
  watchSharedTutorThread,
} from './sharedThreadService'
import { watchAccessibleTutorThreads } from './sharedAccessService'
import type { SharedTutorRef } from './sharedTypes'
import type { ChatThread } from './types'

type ChatController = ReturnType<typeof useChatbot>

function signature(thread: ChatThread): string {
  return JSON.stringify([
    thread.title,
    thread.summary,
    thread.summarizedCount,
    thread.updatedAt,
    thread.messages.map((message) => [message.id, message.text, message.failed, message.images.map((image) => image.id)]),
  ])
}

function mergeRemoteThread(local: ChatThread, remote: ChatThread, keepLocalMetadata: boolean): ChatThread {
  const messages = new Map(remote.messages.map((message) => [message.id, message]))
  for (const message of local.messages) {
    const remoteMessage = messages.get(message.id)
    if (!remoteMessage || (keepLocalMetadata && remoteMessage.failed !== message.failed)) messages.set(message.id, message)
  }
  const metadata = keepLocalMetadata ? local : remote
  return {
    ...metadata,
    ...remote,
    title: metadata.title,
    summary: metadata.summary,
    summarizedCount: metadata.summarizedCount,
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
    messages: [...messages.values()].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)),
  }
}

export function useTutorSharing(
  uid: string | undefined,
  displayName: string,
  chat: ChatController,
) {
  const [sharedState, setSharedState] = useState<{ uid: string; refs: SharedTutorRef[] }>({ uid: '', refs: [] })
  const [error, setError] = useState<string | null>(null)
  const syncState = useRef(new Map<string, { signature: string; count: number }>())
  const writeQueues = useRef(new Map<string, Promise<void>>())
  const pendingSharedIds = useRef(new Set<string>())
  const importThread = chat.importThread
  const deleteThread = chat.deleteThread
  const activeThread = chat.activeThread
  const cachedThreads = useRef(chat.threads)
  useEffect(() => {
    cachedThreads.current = chat.threads
  }, [chat.threads])
  const sharedRefs = sharedState.uid === uid ? sharedState.refs : []

  useEffect(() => {
    if (sharedState.uid !== uid) return
    const availableIds = new Set(sharedState.refs.map((item) => item.threadId))
    for (const thread of chat.threads) {
      if (thread.sharedRole && !availableIds.has(thread.id) && !pendingSharedIds.current.has(thread.id)) {
        deleteThread(thread.id)
      }
    }
  }, [chat.threads, deleteThread, sharedState, uid])

  useEffect(() => {
    if (!uid) return
    const threadUnsubs = new Map<string, { role: SharedTutorRef['role']; unsubscribe: () => void }>()
    let cancelled = false
    const refsUnsub = watchAccessibleTutorThreads(uid, (refs) => {
      if (cancelled) return
      setSharedState({ uid, refs })
      const currentIds = new Set(refs.map((item) => item.threadId))
      currentIds.forEach((id) => pendingSharedIds.current.delete(id))
      for (const thread of cachedThreads.current) {
        if (thread.sharedRole && !currentIds.has(thread.id) && !pendingSharedIds.current.has(thread.id)) {
          deleteThread(thread.id)
        }
      }
      for (const [id, subscription] of threadUnsubs) {
        if (!currentIds.has(id)) {
          subscription.unsubscribe()
          threadUnsubs.delete(id)
          syncState.current.delete(id)
        }
      }
      for (const item of refs) {
        const existing = threadUnsubs.get(item.threadId)
        if (existing?.role === item.role) continue
        existing?.unsubscribe()
        const unsubscribe = watchSharedTutorThread(item.threadId, item.role, item.ownerId, (thread) => {
          if (!thread || cancelled) return
          const local = cachedThreads.current.find((candidate) => candidate.id === thread.id)
          let incoming = thread
          if (local?.sharedRole === thread.sharedRole) {
            const localSignature = signature(local)
            const currentDesired = syncState.current.get(thread.id)?.signature
            const remoteSignature = signature(thread)
            const localIsAhead = currentDesired === localSignature
              && localSignature !== remoteSignature
              && local.updatedAt >= thread.updatedAt
              && local.messages.length >= thread.messages.length
            incoming = {
              ...mergeRemoteThread(local, thread, localIsAhead),
              sharedRole: thread.sharedRole,
              ownerId: thread.ownerId,
            }
          }
          syncState.current.set(incoming.id, { signature: signature(incoming), count: incoming.messages.length })
          importThread(incoming)
        }, (cause) => setError(cause.message))
        threadUnsubs.set(item.threadId, { role: item.role, unsubscribe })
      }
    }, (cause) => setError(cause.message))
    return () => {
      cancelled = true
      refsUnsub()
      threadUnsubs.forEach((subscription) => subscription.unsubscribe())
      threadUnsubs.clear()
    }
  }, [deleteThread, importThread, uid])

  useEffect(() => {
    const thread = activeThread
    if (!uid || !thread || (thread.sharedRole !== 'owner' && thread.sharedRole !== 'editor')) return
    const nextSignature = signature(thread)
    const previous = syncState.current.get(thread.id)
    if (previous?.signature === nextSignature) return
    syncState.current.set(thread.id, { signature: nextSignature, count: thread.messages.length })
    const previousWrite = writeQueues.current.get(thread.id) ?? Promise.resolve()
    const nextWrite = previousWrite
      .catch(() => undefined)
      .then(() => syncSharedThread(thread, uid, displayName, previous?.count ?? thread.messages.length))
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Could not save the shared conversation.')
      })
    writeQueues.current.set(thread.id, nextWrite)
  }, [activeThread, displayName, uid])

  const shareThread = useCallback(async (thread: ChatThread) => {
    if (!uid) throw new Error('Sign in before sharing a conversation.')
    await createSharedThread(thread, uid, displayName)
    const shared = { ...thread, sharedRole: 'owner' as const }
    pendingSharedIds.current.add(thread.id)
    syncState.current.set(thread.id, { signature: signature(shared), count: thread.messages.length })
    importThread(shared, true)
    setError(null)
  }, [displayName, importThread, uid])

  return { sharedRefs, error, clearError: () => setError(null), shareThread }
}
