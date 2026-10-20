export interface NormalizeAnswerOptions {
  ignoreDiacritics?: boolean
  ignorePunctuation?: boolean
}

export function normalizeAnswer(value: string, caseSensitive: boolean, options?: NormalizeAnswerOptions): string {
  // NFKC folds lookalikes (non-breaking spaces, full-width letters); the replace drops invisible characters
  // that survive copy-paste from docs or chats (zero-width spaces/joiners, word joiner, BOM, soft hyphen).
  let normalized = value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
  if (options?.ignoreDiacritics) {
    normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC')
  }
  if (options?.ignorePunctuation) {
    normalized = normalized.replace(/[.,/#!$%^&*;:{}=\-_`~()?"'’“”]/g, '')
  }
  return caseSensitive ? normalized : normalized.toLocaleLowerCase('en-US')
}
