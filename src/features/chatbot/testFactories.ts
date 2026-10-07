import type { ChatImage, ChatMessage, ChatThread } from './types'

/** Small builders shared by the chatbot tests. */

export function makeImage(name: string): ChatImage {
  return { id: name, data: 'QUJD', mimeType: 'image/jpeg', width: 10, height: 10, name }
}

export function makeMessage(
  index: number,
  role: ChatMessage['role'],
  text: string,
  options: { images?: ChatImage[]; failed?: boolean } = {},
): ChatMessage {
  return { id: `m${index}`, role, text, images: options.images ?? [], createdAt: index, failed: options.failed }
}

export function makeThread(messages: ChatMessage[], extra: Partial<ChatThread> = {}): ChatThread {
  return { id: 't1', title: 'Chat', createdAt: 0, updatedAt: 0, messages, summary: '', summarizedCount: 0, ...extra }
}

/** Alternating learner/tutor messages that always end on a learner message (count must be odd). */
export function makeLongChat(count: number, size = 1200): ChatThread {
  return makeThread(
    Array.from({ length: count }, (_, index) =>
      makeMessage(index, index % 2 === 0 ? 'user' : 'assistant', `${index === 0 ? 'FIRST' : `msg${index}`} ${'x'.repeat(size)}`),
    ),
  )
}
