import { HARD_CAP_BASE64_LENGTH } from '../canvas/imageProcessing'
import type { ChatImage, ChatMessage, ChatThread } from './types'

const MIME_TYPES = new Set(['image/jpeg', 'image/webp'])
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/
const MAX_STORED_IMAGES_PER_MESSAGE = 4

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function parseImage(value: unknown): ChatImage | null {
  if (!isRecord(value)) return null
  const { id, data, mimeType, width, height, name } = value
  if (typeof id !== 'string' || typeof name !== 'string') return null
  if (typeof data !== 'string' || data.length === 0 || data.length > HARD_CAP_BASE64_LENGTH || !BASE64.test(data)) return null
  if (typeof mimeType !== 'string' || !MIME_TYPES.has(mimeType)) return null
  if (!isFiniteNumber(width) || !isFiniteNumber(height)) return null
  return { id, data, mimeType: mimeType as ChatImage['mimeType'], width, height, name }
}

function parseMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) return null
  const { id, role, text, images, createdAt, failed } = value
  if (typeof id !== 'string' || typeof text !== 'string' || !isFiniteNumber(createdAt)) return null
  if (role !== 'user' && role !== 'assistant') return null

  const parsedImages = Array.isArray(images)
    ? images
        .slice(0, MAX_STORED_IMAGES_PER_MESSAGE)
        .map(parseImage)
        .filter((image): image is ChatImage => image !== null)
    : []

  const message: ChatMessage = { id, role, text, images: role === 'user' ? parsedImages : [], createdAt }
  if (failed === true) message.failed = true
  return message
}

/** Validates a chat read back from local storage. Anything malformed is dropped rather than trusted. */
export function parseThread(value: unknown): ChatThread | null {
  if (!isRecord(value)) return null
  const { id, title, createdAt, updatedAt, messages, summary, summarizedCount } = value
  if (typeof id !== 'string' || typeof title !== 'string') return null
  if (!isFiniteNumber(createdAt) || !isFiniteNumber(updatedAt) || !Array.isArray(messages)) return null

  const parsedMessages = messages.map(parseMessage).filter((message): message is ChatMessage => message !== null)
  const count = isFiniteNumber(summarizedCount) ? Math.floor(summarizedCount) : 0

  return {
    id,
    title: title.slice(0, 120) || 'New chat',
    createdAt,
    updatedAt,
    messages: parsedMessages,
    summary: typeof summary === 'string' ? summary : '',
    summarizedCount: Math.min(Math.max(0, count), parsedMessages.length),
  }
}
