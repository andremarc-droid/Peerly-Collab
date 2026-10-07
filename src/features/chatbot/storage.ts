import { parseThread } from './parseThread'
import { recoverInterrupted } from './threadUtils'
import type { ChatThread } from './types'

/**
 * Chats are stored on the learner's own device, keyed by user id, so one account never sees another's chats.
 * Images are kept as base64 inside the chat, which is why this uses IndexedDB (large) rather than localStorage (about 5 MB).
 */
export interface ChatStorage {
  load(uid: string): Promise<ChatThread[]>
  save(uid: string, thread: ChatThread): Promise<void>
  remove(uid: string, threadId: string): Promise<void>
}

function toThreads(records: unknown[]): ChatThread[] {
  return records
    .map(parseThread)
    .filter((thread): thread is ChatThread => thread !== null)
    .map(recoverInterrupted)
}

export function createMemoryStorage(): ChatStorage {
  const store = new Map<string, string>()
  const key = (uid: string, id: string) => `${uid}:${id}`

  return {
    async load(uid) {
      const prefix = `${uid}:`
      const records = [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([, value]) => JSON.parse(value) as unknown)
      return toThreads(records)
    },
    async save(uid, thread) {
      store.set(key(uid, thread.id), JSON.stringify(thread))
    },
    async remove(uid, threadId) {
      store.delete(key(uid, threadId))
    },
  }
}

const DB_NAME = 'peerly-chatbot'
const STORE = 'threads'

interface StoredRecord {
  key: string
  uid: string
  thread: ChatThread
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Local storage request failed.'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Local storage write failed.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Local storage write was cancelled.'))
  })
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: 'key' })
      store.createIndex('uid', 'uid')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open local storage.'))
    request.onblocked = () => reject(new Error('Local storage is blocked by another tab.'))
  })
}

export function createIndexedDbStorage(): ChatStorage {
  let database: Promise<IDBDatabase> | null = null
  const open = () => {
    database ??= openDatabase().catch((error: unknown) => {
      database = null
      throw error
    })
    return database
  }

  return {
    async load(uid) {
      const db = await open()
      const records = await requestResult<StoredRecord[]>(
        db.transaction(STORE, 'readonly').objectStore(STORE).index('uid').getAll(IDBKeyRange.only(uid)),
      )
      return toThreads(records.map((record) => record.thread))
    },
    async save(uid, thread) {
      const db = await open()
      const transaction = db.transaction(STORE, 'readwrite')
      const record: StoredRecord = { key: `${uid}:${thread.id}`, uid, thread }
      transaction.objectStore(STORE).put(record)
      await transactionDone(transaction)
    },
    async remove(uid, threadId) {
      const db = await open()
      const transaction = db.transaction(STORE, 'readwrite')
      transaction.objectStore(STORE).delete(`${uid}:${threadId}`)
      await transactionDone(transaction)
    },
  }
}

/** IndexedDB when the browser has it; otherwise chats live in memory for the current visit only. */
export function createChatStorage(): ChatStorage {
  return typeof indexedDB === 'undefined' ? createMemoryStorage() : createIndexedDbStorage()
}
