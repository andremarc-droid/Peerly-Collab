export interface ChatImage {
  id: string
  /** Base64 data without the `data:` prefix. */
  data: string
  mimeType: 'image/jpeg' | 'image/webp'
  width: number
  height: number
  name: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  images: ChatImage[]
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
}
