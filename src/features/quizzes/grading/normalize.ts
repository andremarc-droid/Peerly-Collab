export interface NormalizeAnswerOptions {
  ignoreDiacritics?: boolean
  ignorePunctuation?: boolean
}

export function normalizeAnswer(value: string, caseSensitive: boolean, options?: NormalizeAnswerOptions): string {
  let normalized = value.normalize('NFC').trim().replace(/\s+/g, ' ')
  if (options?.ignoreDiacritics) {
    normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC')
  }
  if (options?.ignorePunctuation) {
    normalized = normalized.replace(/[.,/#!$%^&*;:{}=\-_`~()?"'’“”]/g, '')
  }
  return caseSensitive ? normalized : normalized.toLocaleLowerCase('en-US')
}
