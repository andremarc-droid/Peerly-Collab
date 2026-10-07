/** Rough token estimate; deliberately conservative (about 3.5 characters per token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5)
}
