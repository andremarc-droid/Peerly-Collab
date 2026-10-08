import {
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore'
import { firestore } from '../../lib/firebase/firestore'
import { HARD_CAP_BASE64_LENGTH } from '../canvas/imageProcessing'
import { writeActivity } from './sharedAccessService'
import { parseThread } from './parseThread'
import {
  tutorImageRef,
  tutorMessageRef,
  tutorMessagesRef,
  tutorThreadRef,
} from './sharedPaths'
import type { SharedTutorThread, TutorAccessRole } from './sharedTypes'
import type { ChatImage, ChatMessage, ChatThread } from './types'

export const MAX_SHARED_IMAGE_DATA = Math.min(HARD_CAP_BASE64_LENGTH, 350_000)

function safeName(name: string | null | undefined): string {
  return (name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Learner'
}

function validImage(image: ChatImage): boolean {
  return image.data.length > 0
    && image.data.length <= MAX_SHARED_IMAGE_DATA
    && /^[A-Za-z0-9+/]+={0,2}$/.test(image.data)
    && (image.mimeType === 'image/jpeg' || image.mimeType === 'image/webp')
    && Number.isInteger(image.width) && image.width > 0 && image.width <= 1024
    && Number.isInteger(image.height) && image.height > 0 && image.height <= 1024
    && image.name.length <= 60
}

function rootData(thread: ChatThread, ownerId: string) {
  return {
    ownerId,
    title: thread.title.slice(0, 120),
    summary: thread.summary.slice(0, 12_000),
    summarizedCount: Math.max(0, Math.floor(thread.summarizedCount)),
    createdAtMs: thread.createdAt,
    updatedAtMs: thread.updatedAt,
    createdAt: Timestamp.fromMillis(thread.createdAt),
    updatedAt: serverTimestamp(),
  }
}

async function writeMessage(threadId: string, message: ChatMessage, db: Firestore): Promise<void> {
  for (const image of message.images) {
    if (!validImage(image)) throw new Error(`Image "${image.name}" is too large or invalid to share.`)
  }
  const messageRef = tutorMessageRef(db, threadId, message.id)
  for (const image of message.images) {
    await setDoc(tutorImageRef(db, threadId, message.id, image.id), {
      id: image.id,
      data: image.data,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      name: image.name.slice(0, 60),
    })
  }
  await setDoc(messageRef, {
    id: message.id,
    role: message.role,
    text: message.text.slice(0, 50_000),
    createdAtMs: message.createdAt,
    createdAt: Timestamp.fromMillis(message.createdAt),
    ...(message.failed ? { failed: true } : {}),
    images: message.images.map(({ id, name, mimeType, width, height }) => ({ id, name: name.slice(0, 60), mimeType, width, height })),
  })
}

async function readMessage(threadId: string, data: Record<string, unknown>, db: Firestore): Promise<ChatMessage | null> {
  const base = parseThread({
    id: 'temporary',
    title: 'temporary',
    createdAt: 0,
    updatedAt: 0,
    summary: '',
    summarizedCount: 0,
    messages: [{ ...data, createdAt: data.createdAtMs, images: [] }],
  })
  const message = base?.messages[0]
  if (!message) return null
  const metadata = Array.isArray(data.images) ? data.images.slice(0, 2) : []
  const images = (await Promise.all(metadata.map(async (entry) => {
    if (!entry || typeof entry !== 'object') return null
    const details = entry as Record<string, unknown>
    if (
      typeof details.id !== 'string'
      || typeof details.name !== 'string'
      || (details.mimeType !== 'image/jpeg' && details.mimeType !== 'image/webp')
      || typeof details.width !== 'number'
      || typeof details.height !== 'number'
    ) return null
    const imageSnap = await getDoc(tutorImageRef(db, threadId, message.id, details.id))
    if (!imageSnap.exists()) return null
    const image = imageSnap.data()
    const candidate = {
      id: imageSnap.id,
      data: typeof image.data === 'string' ? image.data : '',
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      name: typeof image.name === 'string' ? image.name : '',
    }
    return validImage(candidate as ChatImage) ? candidate as ChatImage : null
  }))).filter((image): image is ChatImage => image !== null)
  return { ...message, images }
}

export async function loadSharedThread(
  threadId: string,
  role: TutorAccessRole,
  ownerId: string,
  db: Firestore = firestore,
): Promise<SharedTutorThread | null> {
  const root = await getDoc(tutorThreadRef(db, threadId))
  if (!root.exists()) return null
  const data = root.data()
  const messagesSnap = await getDocs(query(tutorMessagesRef(db, threadId), orderBy('createdAtMs', 'asc')))
  const messages = (await Promise.all(messagesSnap.docs.map((item) => readMessage(threadId, item.data(), db))))
    .filter((message): message is ChatMessage => message !== null)
  const parsed = parseThread({
    id: threadId,
    title: data.title,
    createdAt: data.createdAtMs,
    updatedAt: data.updatedAtMs,
    summary: data.summary,
    summarizedCount: data.summarizedCount,
    messages,
  })
  return parsed ? { ...parsed, sharedRole: role, ownerId } : null
}

export async function createSharedThread(
  thread: ChatThread,
  uid: string,
  displayName: string,
  db: Firestore = firestore,
): Promise<void> {
  const existing = await getDoc(tutorThreadRef(db, thread.id))
  if (existing.exists() && existing.data().ownerId !== uid) throw new Error('That conversation ID is already in use.')
  for (const message of thread.messages) {
    if ((message.documents?.length ?? 0) > 0) {
      // Shared messages sync through a fixed set of fields, so attached documents would be silently dropped.
      throw new Error('This chat has attached documents, which cannot be shared yet. Start a new chat to share a conversation.')
    }
    for (const image of message.images) {
      if (!validImage(image)) throw new Error(`Image "${image.name}" is too large to share. Remove it from the chat and try again.`)
    }
  }
  await setDoc(tutorThreadRef(db, thread.id), rootData(thread, uid))
  for (const message of thread.messages) await writeMessage(thread.id, message, db)
  await writeActivity(thread.id, uid, safeName(displayName), 'Shared this tutor conversation.', db)
}

export async function syncSharedThread(
  thread: ChatThread,
  uid: string,
  name: string,
  previousMessageCount: number,
  db: Firestore = firestore,
): Promise<void> {
  const ref = tutorThreadRef(db, thread.id)
  await setDoc(ref, rootData(thread, thread.ownerId || uid), { merge: true })
  const latest = thread.messages[thread.messages.length - 1]
  if (latest) await writeMessage(thread.id, latest, db)
  if (thread.messages.length > previousMessageCount && latest?.role === 'user') {
    await writeActivity(thread.id, uid, safeName(name), 'Added a message to the conversation.', db)
  }
}

export function watchSharedTutorThread(
  threadId: string,
  role: TutorAccessRole,
  ownerId: string,
  onChange: (thread: SharedTutorThread | null) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
): Unsubscribe {
  let rootData: Record<string, unknown> | null = null
  let messageDocs: Record<string, unknown>[] = []
  let version = 0
  const refresh = async () => {
    const currentVersion = ++version
    if (!rootData) return
    try {
      const messages = await Promise.all(messageDocs.map((message) => readMessage(threadId, message, db)))
      if (currentVersion !== version) return
      const actualOwner = typeof rootData.ownerId === 'string' ? rootData.ownerId : ownerId
      const parsed = parseThread({
        id: threadId,
        title: rootData.title,
        createdAt: rootData.createdAtMs,
        updatedAt: rootData.updatedAtMs,
        summary: rootData.summary,
        summarizedCount: rootData.summarizedCount,
        messages: messages.filter((message): message is ChatMessage => message !== null),
      })
      onChange(parsed ? { ...parsed, sharedRole: role, ownerId: actualOwner } : null)
    } catch (cause) {
      onError(cause instanceof Error ? cause : new Error('Could not load this shared conversation.'))
    }
  }
  const rootUnsub = onSnapshot(tutorThreadRef(db, threadId), (snap) => {
    rootData = snap.exists() ? snap.data() : null
    if (!rootData) {
      onChange(null)
      return
    }
    void refresh()
  }, onError)
  const messagesUnsub = onSnapshot(query(tutorMessagesRef(db, threadId), orderBy('createdAtMs', 'asc')), (snap) => {
    messageDocs = snap.docs.map((item) => item.data())
    void refresh()
  }, onError)
  return () => {
    version += 1
    rootUnsub()
    messagesUnsub()
  }
}
