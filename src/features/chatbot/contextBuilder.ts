import type { GroqContentPart, GroqMessage } from '../../lib/groq/client'
import { toDataUrl } from '../canvas/imageProcessing'
import {
  COMPACT_KEEP_RATIO,
  IMAGE_MEMORY_MESSAGES,
  IMAGE_TOKEN_COST,
  MAX_IMAGES_PER_REQUEST,
  MAX_INPUT_TOKENS,
  MESSAGE_TOKEN_OVERHEAD,
} from './constants'
import { buildSystemPrompt } from './systemPrompt'
import { estimateTokens } from './tokenEstimate'
import type { ChatImage, ChatMessage, ChatThread } from './types'

export interface ContextLimits {
  maxInputTokens: number
  maxImagesPerRequest: number
  imageTokenCost: number
  imageMemoryMessages: number
}

export const DEFAULT_CONTEXT_LIMITS: ContextLimits = {
  maxInputTokens: MAX_INPUT_TOKENS,
  maxImagesPerRequest: MAX_IMAGES_PER_REQUEST,
  imageTokenCost: IMAGE_TOKEN_COST,
  imageMemoryMessages: IMAGE_MEMORY_MESSAGES,
}

export interface ContextInput {
  thread: ChatThread
  classLabel?: string
  limits?: Partial<ContextLimits>
}

export interface BuiltContext {
  messages: GroqMessage[]
  /** Index (in thread.messages) of the oldest message sent word for word. */
  windowStart: number
  imageCount: number
  estimatedTokens: number
}

export interface CompactionPlan {
  /** Messages in [from, to) should be folded into the summary. */
  from: number
  to: number
}

interface Slot {
  message: ChatMessage
  index: number
}

interface Prepared {
  limits: ContextLimits
  slots: Slot[]
  latest: Slot
  latestImages: ChatImage[]
  systemText: string
  /** Tokens left for earlier messages after the system prompt and the newest message. */
  historyBudget: number
}

function imageNotes(message: ChatMessage): string {
  return message.images
    .map((image) => `[Image "${image.name}" was attached here earlier. Rely on your earlier reply about it.]`)
    .join('\n')
}

function visibleText(message: ChatMessage, withImages: boolean): string {
  if (withImages || message.images.length === 0) return message.text
  return [message.text, imageNotes(message)].filter(Boolean).join('\n')
}

function tokenCost(
  message: ChatMessage,
  withImages: boolean,
  limits: ContextLimits,
  imageCount: number = message.images.length,
): number {
  return (
    estimateTokens(visibleText(message, withImages)) +
    MESSAGE_TOKEN_OVERHEAD +
    (withImages ? imageCount * limits.imageTokenCost : 0)
  )
}

function toGroqMessage(message: ChatMessage, images: ChatImage[]): GroqMessage {
  if (message.role === 'assistant') return { role: 'assistant', content: message.text }
  if (images.length === 0) return { role: 'user', content: visibleText(message, false) }

  const parts: GroqContentPart[] = [
    { type: 'text', text: message.text || 'Please look at the attached image.' },
    ...images.map(
      (image): GroqContentPart => ({ type: 'image_url', image_url: { url: toDataUrl(image.mimeType, image.data) } }),
    ),
  ]
  return { role: 'user', content: parts }
}

function prepare({ thread, classLabel, limits }: ContextInput): Prepared {
  const resolved: ContextLimits = { ...DEFAULT_CONTEXT_LIMITS, ...limits }
  // Failed or stopped messages never reach the model.
  const slots = thread.messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => !message.failed)

  const latest = slots[slots.length - 1]
  if (!latest || latest.message.role !== 'user') throw new Error('There is no message to send.')

  const latestImages = latest.message.images.slice(0, resolved.maxImagesPerRequest)
  const systemText = buildSystemPrompt({ classLabel, summary: thread.summary })
  const fixed =
    estimateTokens(systemText) + tokenCost(latest.message, latestImages.length > 0, resolved, latestImages.length)

  return { limits: resolved, slots, latest, latestImages, systemText, historyBudget: resolved.maxInputTokens - fixed }
}

/**
 * Builds the request for ONE chat from that chat's own stored history, so chats never mix.
 * The newest message is always sent (with its images). Earlier messages are added newest-first until the
 * token budget is used. Images from earlier messages are re-sent only while recent; otherwise they become a
 * short note. Everything older than the window is covered by `thread.summary`, which is part of the system prompt.
 */
export function buildContext(input: ContextInput): BuiltContext {
  const { limits, slots, latest, latestImages, systemText, historyBudget } = prepare(input)
  let remaining = historyBudget
  let imageCount = latestImages.length
  const history: Array<{ index: number; role: ChatMessage['role']; message: GroqMessage }> = []

  for (let position = slots.length - 2; position >= 0; position -= 1) {
    const { message, index } = slots[position]
    if (index < input.thread.summarizedCount) break

    const age = slots.length - 1 - position
    const showImages =
      message.images.length > 0 &&
      age <= limits.imageMemoryMessages &&
      imageCount + message.images.length <= limits.maxImagesPerRequest &&
      tokenCost(message, true, limits) <= remaining
    const cost = tokenCost(message, showImages, limits)
    if (cost > remaining) break

    remaining -= cost
    if (showImages) imageCount += message.images.length
    history.unshift({
      index,
      role: message.role,
      message: toGroqMessage(message, showImages ? message.images : []),
    })
  }

  // The conversation sent to the model should open with a learner turn.
  while (history.length > 0 && history[0].role === 'assistant') history.shift()

  return {
    messages: [
      { role: 'system', content: systemText },
      ...history.map((entry) => entry.message),
      toGroqMessage(latest.message, latestImages),
    ],
    windowStart: history[0]?.index ?? latest.index,
    imageCount,
    estimatedTokens: limits.maxInputTokens - remaining,
  }
}

/**
 * Decides whether older messages must be folded into the summary before the next request.
 * When the window overflows it compacts down to about half of the history budget, so the extra
 * summary call happens only once every few turns instead of on every message.
 */
export function planCompaction(input: ContextInput): CompactionPlan | null {
  const prepared = prepare(input)
  const built = buildContext(input)
  const from = input.thread.summarizedCount
  if (built.windowStart <= from) return null

  const keepBudget = Math.max(0, Math.floor(prepared.historyBudget * COMPACT_KEEP_RATIO))
  const kept: Slot[] = []
  let used = 0
  for (let position = prepared.slots.length - 2; position >= 0; position -= 1) {
    const slot = prepared.slots[position]
    if (slot.index < from) break
    const cost = tokenCost(slot.message, false, prepared.limits)
    if (used + cost > keepBudget) break
    used += cost
    kept.unshift(slot)
  }
  while (kept.length > 0 && kept[0].message.role === 'assistant') kept.shift()

  const to = kept[0]?.index ?? prepared.latest.index
  return { from, to: Math.max(to, built.windowStart) }
}
