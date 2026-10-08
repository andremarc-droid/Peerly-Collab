import type { ChatDocument, ChatImage, ChatMessage, ChatThread } from './types'

export type IdFactory = () => string

const defaultId: IdFactory = () => crypto.randomUUID()

export function createThread(now: number = Date.now(), makeId: IdFactory = defaultId): ChatThread {
  return { id: makeId(), title: 'New chat', createdAt: now, updatedAt: now, messages: [], summary: '', summarizedCount: 0 }
}

export function deriveTitle(text: string, imageCount: number, documentName?: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean) return clean.length > 48 ? `${clean.slice(0, 47).trimEnd()}…` : clean
  if (documentName) return documentName.length > 48 ? `${documentName.slice(0, 47).trimEnd()}…` : documentName
  return imageCount > 0 ? 'Image question' : 'New chat'
}

export function createUserMessage(
  input: { text: string; images: ChatImage[]; documents?: ChatDocument[] },
  now: number = Date.now(),
  makeId: IdFactory = defaultId,
): ChatMessage {
  const message: ChatMessage = { id: makeId(), role: 'user', text: input.text, images: input.images, createdAt: now }
  if (input.documents && input.documents.length > 0) message.documents = input.documents
  return message
}

export function createAssistantMessage(text: string, now: number = Date.now(), makeId: IdFactory = defaultId): ChatMessage {
  return { id: makeId(), role: 'assistant', text, images: [], createdAt: now }
}

/** Appends a message; the first user message also names the chat. */
export function appendMessage(thread: ChatThread, message: ChatMessage): ChatThread {
  const namesThread = thread.messages.length === 0 && message.role === 'user'
  return {
    ...thread,
    title: namesThread ? deriveTitle(message.text, message.images.length, message.documents?.[0]?.name) : thread.title,
    updatedAt: message.createdAt,
    messages: [...thread.messages, message],
  }
}

export function setMessageFailed(thread: ChatThread, messageId: string, failed: boolean): ChatThread {
  return {
    ...thread,
    messages: thread.messages.map((message) => (message.id === messageId ? { ...message, failed } : message)),
  }
}

export function findLastUserMessage(thread: ChatThread): ChatMessage | undefined {
  for (let index = thread.messages.length - 1; index >= 0; index -= 1) {
    if (thread.messages[index].role === 'user') return thread.messages[index]
  }
  return undefined
}

/**
 * A reload or closed tab can interrupt a request, leaving a user message with no reply.
 * Mark it failed so the learner sees a Retry button instead of a chat that looks stuck.
 */
export function recoverInterrupted(thread: ChatThread): ChatThread {
  const last = thread.messages[thread.messages.length - 1]
  if (!last || last.role !== 'user' || last.failed) return thread
  return setMessageFailed(thread, last.id, true)
}

/** Newest first. */
export function sortThreads(threads: ChatThread[]): ChatThread[] {
  return [...threads].sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Ids of the oldest chats that exceed `max`. */
export function threadsToPrune(threads: ChatThread[], max: number): string[] {
  return sortThreads(threads)
    .slice(Math.max(0, max))
    .map((thread) => thread.id)
}
