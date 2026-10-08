export interface ChatImage {
  id: string
  /** Base64 data without the `data:` prefix. */
  data: string
  mimeType: 'image/jpeg' | 'image/webp'
  width: number
  height: number
  name: string
}

/** Text read from a file the learner attached. Plain text only; the original file is never stored. */
export interface ChatDocument {
  id: string
  name: string
  text: string
  /** True when only part of the file was kept (page or length limit). */
  truncated: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  images: ChatImage[]
  /** Documents attached to a learner message. Kept on this device only; shared conversations do not sync them. */
  documents?: ChatDocument[]
  createdAt: number
  /** True when the AI request for this user message failed or was stopped. */
  failed?: boolean
}

export interface ChatThread {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
  /** Running summary of the oldest messages that no longer fit in a request. */
  summary: string
  /** How many leading messages (by index) are already folded into `summary`. */
  summarizedCount: number
  /** Set only from an authenticated shared-thread document; not trusted by parseThread. */
  sharedRole?: 'owner' | 'viewer' | 'editor'
  /** Owner identity is attached by the authenticated shared-thread listener only. */
  ownerId?: string
}
