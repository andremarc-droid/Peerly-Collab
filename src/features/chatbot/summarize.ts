import { createChatCompletion, type CompleteFn } from '../../lib/groq/client'
import { SUMMARY_MAX_TOKENS, SUMMARY_MAX_TRANSCRIPT_CHARS } from './constants'
import type { ChatMessage } from './types'

const SUMMARY_SYSTEM_PROMPT =
  "You maintain a running summary of a tutoring chat so the tutor never loses context. Merge the previous summary with the new messages. Keep the learner's goals and level, key facts, definitions and worked steps, decisions, open questions, and what any attached image showed (taken from the tutor's replies). Write plain text, under 250 words, with no preamble."

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

/** Plain-text transcript for the summarizer. Images become short name tags. */
export function buildTranscript(messages: ChatMessage[], maxChars: number = SUMMARY_MAX_TRANSCRIPT_CHARS): string {
  const usable = messages.filter((message) => !message.failed)
  const perMessage = Math.max(200, Math.min(1200, Math.floor(maxChars / Math.max(1, usable.length))))

  return usable
    .map((message) => {
      const speaker = message.role === 'user' ? 'Learner' : 'Tutor'
      const attached =
        message.images.length > 0 ? ` [attached: ${message.images.map((image) => image.name).join(', ')}]` : ''
      return `${speaker}: ${clip(message.text, perMessage)}${attached}`
    })
    .join('\n')
}

interface SummarizeInput {
  previousSummary: string
  messages: ChatMessage[]
  signal?: AbortSignal
}

/** Folds older messages into the running summary (text only, so it never spends image tokens). */
export async function summarizeMessages(
  { previousSummary, messages, signal }: SummarizeInput,
  complete: CompleteFn = createChatCompletion,
): Promise<string> {
  const transcript = buildTranscript(messages)
  if (!transcript) return previousSummary

  const reply = await complete({
    messages: [
      { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Previous summary:\n${previousSummary.trim() || '(none)'}\n\nNew messages:\n${transcript}`,
      },
    ],
    maxTokens: SUMMARY_MAX_TOKENS,
    temperature: 0.2,
    signal,
  })

  const summary = reply.trim()
  if (!summary) throw new Error('The summary was empty.')
  return summary
}
