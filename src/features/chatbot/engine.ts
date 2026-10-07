import { createChatCompletion, type CompleteFn } from '../../lib/groq/client'
import { MAX_OUTPUT_TOKENS } from './constants'
import { buildContext, planCompaction } from './contextBuilder'
import { summarizeMessages } from './summarize'
import { appendMessage, createAssistantMessage } from './threadUtils'
import type { ChatThread } from './types'

export interface GenerateReplyInput {
  /** The chat to answer. Its last usable message must be from the learner. */
  thread: ChatThread
  classLabel?: string
  signal?: AbortSignal
  complete?: CompleteFn
  /** Called after older messages are folded into the summary, so the progress can be saved before the reply. */
  onThreadChange?: (thread: ChatThread) => void
}

/**
 * Runs one tutoring turn for a single chat:
 * 1. If the chat no longer fits in one request, fold the oldest messages into its running summary first.
 * 2. Send the summary plus the recent messages (and images) and append the tutor's reply.
 * A failure leaves the chat unchanged apart from any summary progress, so Retry is always safe.
 */
export async function generateReply({
  thread,
  classLabel,
  signal,
  complete = createChatCompletion,
  onThreadChange,
}: GenerateReplyInput): Promise<ChatThread> {
  let working = thread

  const plan = planCompaction({ thread: working, classLabel })
  if (plan) {
    const summary = await summarizeMessages(
      { previousSummary: working.summary, messages: working.messages.slice(plan.from, plan.to), signal },
      complete,
    )
    working = { ...working, summary, summarizedCount: plan.to }
    onThreadChange?.(working)
  }

  const context = buildContext({ thread: working, classLabel })
  const reply = await complete({ messages: context.messages, maxTokens: MAX_OUTPUT_TOKENS, signal })
  return appendMessage(working, createAssistantMessage(reply))
}
