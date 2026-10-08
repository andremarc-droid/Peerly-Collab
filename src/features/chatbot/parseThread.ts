import { HARD_CAP_BASE64_LENGTH } from '../canvas/imageProcessing'
import { MAX_DOCUMENT_NAME_CHARS, MAX_DOCUMENT_TEXT_CHARS } from '../documents/constants'
import { MAX_DOCUMENTS_PER_MESSAGE } from './constants'
import type { ChatDocument, ChatImage, ChatMessage, ChatThread } from './types'

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

function parseDocument(value: unknown): ChatDocument | null {
  if (!isRecord(value)) return null
  const { id, name, text, truncated } = value
  if (typeof id !== 'string' || typeof name !== 'string' || typeof text !== 'string') return null
  if (text.trim().length === 0 || text.length > MAX_DOCUMENT_TEXT_CHARS) return null
  return { id, name: name.slice(0, MAX_DOCUMENT_NAME_CHARS) || 'document', text, truncated: truncated === true }
}

function parseMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) return null
  const { id, role, text, images, documents, createdAt, failed } = value
  if (typeof id !== 'string' || typeof text !== 'string' || !isFiniteNumber(createdAt)) return null
  if (role !== 'user' && role !== 'assistant') return null

  const parsedImages = Array.isArray(images)
    ? images
        .slice(0, MAX_STORED_IMAGES_PER_MESSAGE)
        .map(parseImage)
        .filter((image): image is ChatImage => image !== null)
    : []

  const message: ChatMessage = { id, role, text, images: role === 'user' ? parsedImages : [], createdAt }
  const parsedDocuments =
    role === 'user' && Array.isArray(documents)
      ? documents
          .slice(0, MAX_DOCUMENTS_PER_MESSAGE)
          .map(parseDocument)
          .filter((document): document is ChatDocument => document !== null)
      : []
  if (parsedDocuments.length > 0) message.documents = parsedDocuments
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

  const parsed: ChatThread = {
    id,
    title: title.slice(0, 120) || 'New chat',
    createdAt,
    updatedAt,
    messages: parsedMessages,
    summary: typeof summary === 'string' ? summary : '',
    summarizedCount: Math.min(Math.max(0, count), parsedMessages.length),
  }
  // A local cache can only mark a thread as shared; the Firestore listener supplies its actual role.
  if (value.sharedRole === 'owner' || value.sharedRole === 'viewer' || value.sharedRole === 'editor') {
    parsed.sharedRole = 'viewer'
  }
  return parsed
}
