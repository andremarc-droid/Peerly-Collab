import { MAX_DOCUMENT_NAME_CHARS } from './constants'

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g
const SAMPLE_WINDOWS = 6
const SAMPLE_MARKER = '\n[…]\n'

/** Normalizes text pulled out of a file: one newline style, no control characters, tidy spacing. */
export function cleanExtractedText(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS, '')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function cleanFileName(name: string): string {
  const clean = name.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim().slice(0, MAX_DOCUMENT_NAME_CHARS)
  return clean || 'document'
}

export interface CondensedText {
  text: string
  /** True when the original was longer than the budget and had to be sampled. */
  condensed: boolean
}

function endAtBoundary(piece: string): string {
  const floor = Math.floor(piece.length * 0.6)
  const cut = Math.max(piece.lastIndexOf('. '), piece.lastIndexOf('\n'), piece.lastIndexOf('? '), piece.lastIndexOf('! '))
  return cut >= floor ? piece.slice(0, cut + 1).trimEnd() : piece.trimEnd()
}

/** Moves a window start forward to the next sentence start if one is close, otherwise to the next word. */
function startAtSentence(text: string, start: number): number {
  if (start <= 0) return 0
  const ahead = text.slice(start, start + 200)
  const sentence = ahead.search(/[.!?]\s/)
  if (sentence !== -1) return start + sentence + 2
  const word = ahead.slice(0, 40).search(/\s/)
  return word === -1 ? start : start + word + 1
}

/**
 * Fits a long document into a small AI budget while still covering all of it.
 * Instead of keeping only the first pages, the budget is split into a few windows spread evenly across the
 * text; each window keeps the start of its section. Gaps are marked with "[…]" so the model knows text is missing.
 * Short text is returned unchanged.
 */
export function condenseText(text: string, maxChars: number): CondensedText {
  if (maxChars <= 0) return { text: '', condensed: text.length > 0 }
  if (text.length <= maxChars) return { text, condensed: false }

  const windows = maxChars < 1200 ? 1 : SAMPLE_WINDOWS
  const perWindow = Math.floor((maxChars - SAMPLE_MARKER.length * (windows - 1)) / windows)
  const pieces: string[] = []

  for (let index = 0; index < windows; index += 1) {
    const start = startAtSentence(text, Math.floor((index * text.length) / windows))
    const raw = text.slice(start, start + perWindow)
    const isLastWindow = index === windows - 1
    const piece = isLastWindow && start + perWindow >= text.length ? raw.trimEnd() : endAtBoundary(raw)
    if (piece) pieces.push(piece)
  }

  return { text: pieces.join(SAMPLE_MARKER).slice(0, maxChars), condensed: true }
}
