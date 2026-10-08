import { condenseText } from '../documents/text'
import { MAX_CHAT_DOCUMENT_CHARS } from './constants'
import type { ChatMessage } from './types'

export interface PromptDocument {
  name: string
  text: string
  /** True when the text was sampled or the file was only read in part, so passages are missing. */
  shortened: boolean
}

/**
 * The documents the tutor can see for the next request: those on the newest learner message that has any.
 * They stay open for follow-up questions until the learner attaches something newer, and they are sent with
 * every request (inside the system prompt) rather than only on the turn they were attached.
 * All of them together fit in MAX_CHAT_DOCUMENT_CHARS; a long one is sampled across its whole length.
 */
export function selectPromptDocuments(messages: ChatMessage[]): PromptDocument[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    const documents = message.role === 'user' ? message.documents : undefined
    if (!documents || documents.length === 0) continue

    const share = Math.floor(MAX_CHAT_DOCUMENT_CHARS / documents.length)
    return documents.map((document) => {
      const fitted = condenseText(document.text, share)
      return { name: document.name, text: fitted.text, shortened: fitted.condensed || document.truncated }
    })
  }
  return []
}
