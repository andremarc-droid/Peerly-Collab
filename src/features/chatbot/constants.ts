/**
 * Limits are tuned for Groq's 8K tokens-per-minute cap on qwen/qwen3.8-27b.
 * Every image costs 2,048 input tokens, so requests stay small: old images are replaced by a text note
 * and old messages are folded into a running summary instead of being dropped.
 * Raise these if the Groq plan gets higher limits.
 */
export const MAX_INPUT_TOKENS = 5800
export const MAX_OUTPUT_TOKENS = 1024
export const IMAGE_TOKEN_COST = 2048
export const MESSAGE_TOKEN_OVERHEAD = 8

export const MAX_IMAGES_PER_MESSAGE = 2
export const MAX_IMAGES_PER_REQUEST = 2
/** An earlier image is re-sent only while it is within this many messages of the newest one. */
export const IMAGE_MEMORY_MESSAGES = 4

export const MAX_MESSAGE_CHARS = 3000

export const SUMMARY_MAX_TOKENS = 400
export const SUMMARY_MAX_TRANSCRIPT_CHARS = 6000
/** When compacting, keep this share of the history budget as verbatim recent messages. */
export const COMPACT_KEEP_RATIO = 0.5

export const MAX_THREADS = 30
