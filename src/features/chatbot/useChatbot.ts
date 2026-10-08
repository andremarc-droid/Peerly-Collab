import { useCallback, useEffect, useRef, useState } from 'react'
import { createChatCompletion, isAbortError, type CompleteFn } from '../../lib/groq/client'
import { getGroqConfigIssue } from '../../lib/groq/requiredEnv'
import { MAX_MESSAGE_CHARS, MAX_THREADS } from './constants'
import { generateReply } from './engine'
import { createChatStorage, createMemoryStorage, type ChatStorage } from './storage'
import {
  appendMessage,
  createThread,
  createUserMessage,
  findLastUserMessage,
  setMessageFailed,
  sortThreads,
  threadsToPrune,
} from './threadUtils'
import type { ChatDocument, ChatImage, ChatThread } from './types'

export interface SendInput {
  text: string
  images: ChatImage[]
  /** Left out (not an empty list) when the message has no documents. */
  documents?: ChatDocument[]
}

interface UseChatbotOptions {
  /** Signed-in user id. Chats are stored per user. */
  uid: string | undefined
  /** Name of the class the learner is looking at; passed to the tutor as a hint. */
  classLabel?: string
  /** Test hooks. */
  storage?: ChatStorage
  complete?: CompleteFn
  /** Overrides the environment check. `null` means "configured". */
  configIssue?: string | null
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Something went wrong. Please try again.'
}

export function useChatbot({ uid, classLabel, storage, complete = createChatCompletion, configIssue }: UseChatbotOptions) {
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState<Record<string, true>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [storageWarning, setStorageWarning] = useState(false)

  const threadsRef = useRef<ChatThread[]>([])
  const activeIdRef = useRef<string | null>(null)
  const uidRef = useRef(uid)
  const classLabelRef = useRef(classLabel)
  const completeRef = useRef(complete)
  const storageRef = useRef<ChatStorage | null>(storage ?? null)
  const controllers = useRef(new Map<string, AbortController>())

  useEffect(() => {
    uidRef.current = uid
    classLabelRef.current = classLabel
    completeRef.current = complete
  })

  const issue = configIssue === undefined ? getGroqConfigIssue() : configIssue

  const getStorage = useCallback((): ChatStorage => {
    storageRef.current ??= createChatStorage()
    return storageRef.current
  }, [])

  const publish = useCallback((next: ChatThread[]) => {
    threadsRef.current = next
    setThreads(next)
  }, [])

  const selectId = useCallback((id: string | null) => {
    activeIdRef.current = id
    setActiveId(id)
  }, [])

  const persist = useCallback(
    (thread: ChatThread) => {
      const owner = uidRef.current
      if (!owner || thread.messages.length === 0) return
      getStorage()
        .save(owner, thread)
        .catch(() => setStorageWarning(true))
    },
    [getStorage],
  )

  const importThread = useCallback(
    (thread: ChatThread, select = false) => {
      const next = sortThreads([thread, ...threadsRef.current.filter((existing) => existing.id !== thread.id)])
      publish(next)
      persist(thread)
      if (select) selectId(thread.id)
    },
    [persist, publish, selectId],
  )

  const forget = useCallback(
    (threadId: string) => {
      const owner = uidRef.current
      if (!owner) return
      getStorage()
        .remove(owner, threadId)
        .catch(() => setStorageWarning(true))
    },
    [getStorage],
  )

  /** Saves a chat's new state. Ignores chats that were deleted while a request was running. */
  const commit = useCallback(
    (thread: ChatThread, allowCreate = false) => {
      if (!allowCreate && !threadsRef.current.some((existing) => existing.id === thread.id)) return
      let next = sortThreads([thread, ...threadsRef.current.filter((existing) => existing.id !== thread.id)])

      const doomed = threadsToPrune(next, MAX_THREADS).filter((id) => id !== thread.id && !controllers.current.has(id))
      if (doomed.length > 0) {
        next = next.filter((existing) => !doomed.includes(existing.id))
        doomed.forEach(forget)
      }
      publish(next)
      persist(thread)
    },
    [forget, persist, publish],
  )

  // Load this user's saved chats.
  useEffect(() => {
    if (!uid) return
    let cancelled = false
    const running = controllers.current

    void (async () => {
      let loaded: ChatThread[] = []
      try {
        loaded = await getStorage().load(uid)
      } catch {
        storageRef.current = createMemoryStorage()
        setStorageWarning(true)
      }
      if (cancelled) return
      const sorted = sortThreads(loaded)
      publish(sorted)
      selectId(sorted[0]?.id ?? null)
      setReady(true)
    })()

    return () => {
      cancelled = true
      running.forEach((controller) => controller.abort())
    }
  }, [uid, getStorage, publish, selectId])

  const setBusy = useCallback((id: string, busy: boolean) => {
    setPending((previous) => {
      const next = { ...previous }
      if (busy) next[id] = true
      else delete next[id]
      return next
    })
  }, [])

  const setError = useCallback((id: string, message: string | null) => {
    setErrors((previous) => {
      const next = { ...previous }
      if (message) next[id] = message
      else delete next[id]
      return next
    })
  }, [])

  const run = useCallback(
    async (id: string) => {
      const current = threadsRef.current.find((thread) => thread.id === id)
      if (!current || current.sharedRole === 'viewer' || controllers.current.has(id)) return

      const controller = new AbortController()
      controllers.current.set(id, controller)
      setBusy(id, true)
      setError(id, null)

      try {
        const updated = await generateReply({
          thread: current,
          classLabel: classLabelRef.current,
          signal: controller.signal,
          complete: completeRef.current,
          onThreadChange: (progress) => commit(progress),
        })
        commit(updated)
      } catch (error) {
        const latest = threadsRef.current.find((thread) => thread.id === id)
        const lastUser = latest ? findLastUserMessage(latest) : undefined
        if (latest && lastUser) commit(setMessageFailed(latest, lastUser.id, true))
        if (!isAbortError(error)) setError(id, messageOf(error))
      } finally {
        controllers.current.delete(id)
        setBusy(id, false)
      }
    },
    [commit, setBusy, setError],
  )

  const send = useCallback(
    ({ text, images, documents = [] }: SendInput): boolean => {
      const trimmed = text.trim()
      if (!uidRef.current || (!trimmed && images.length === 0 && documents.length === 0)) return false

      const base =
        threadsRef.current.find((thread) => thread.id === activeIdRef.current) ?? createThread()
      if (base.sharedRole === 'viewer') return false
      if (controllers.current.has(base.id)) return false
      if (documents.length > 0 && base.sharedRole !== undefined) {
        // Shared conversations sync through a fixed set of fields, so documents would be dropped for everyone else.
        setError(base.id, 'Documents cannot be added to shared conversations yet. Start a new chat to use a document.')
        return false
      }
      if (trimmed.length > MAX_MESSAGE_CHARS) {
        setError(base.id, `Messages can be up to ${MAX_MESSAGE_CHARS} characters.`)
        return false
      }

      const next = appendMessage(base, createUserMessage({ text: trimmed, images, documents }))
      selectId(next.id)
      commit(next, true)
      void run(next.id)
      return true
    },
    [commit, run, selectId, setError],
  )

  const retry = useCallback(() => {
    const id = activeIdRef.current
    const thread = threadsRef.current.find((existing) => existing.id === id)
    if (!id || !thread || thread.sharedRole === 'viewer' || controllers.current.has(id)) return
    const last = thread.messages[thread.messages.length - 1]
    if (!last || last.role !== 'user' || !last.failed) return
    commit(setMessageFailed(thread, last.id, false))
    void run(id)
  }, [commit, run])

  const stop = useCallback(() => {
    const id = activeIdRef.current
    if (id) controllers.current.get(id)?.abort()
  }, [])

  const newChat = useCallback(() => {
    const current = threadsRef.current.find((thread) => thread.id === activeIdRef.current)
    if (current && current.messages.length === 0) return
    const draft = createThread()
    publish(sortThreads([draft, ...threadsRef.current.filter((thread) => thread.messages.length > 0)]))
    selectId(draft.id)
  }, [publish, selectId])

  const selectThread = useCallback(
    (id: string) => {
      publish(threadsRef.current.filter((thread) => thread.id === id || thread.messages.length > 0))
      selectId(id)
    },
    [publish, selectId],
  )

  const deleteThread = useCallback(
    (id: string) => {
      controllers.current.get(id)?.abort()
      const remaining = threadsRef.current.filter((thread) => thread.id !== id)
      publish(remaining)
      forget(id)
      setError(id, null)
      if (activeIdRef.current === id) selectId(remaining[0]?.id ?? null)
    },
    [forget, publish, selectId, setError],
  )

  const dismissError = useCallback(() => {
    if (activeIdRef.current) setError(activeIdRef.current, null)
  }, [setError])

  const activeThread = threads.find((thread) => thread.id === activeId) ?? null

  return {
    ready,
    threads,
    activeId,
    activeThread,
    isSending: activeId ? Boolean(pending[activeId]) : false,
    error: activeId ? (errors[activeId] ?? null) : null,
    configIssue: issue,
    storageWarning,
    send,
    retry,
    stop,
    newChat,
    selectThread,
    importThread,
    deleteThread,
    dismissError,
  }
}
