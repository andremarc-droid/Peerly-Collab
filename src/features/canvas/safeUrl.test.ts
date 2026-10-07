import { describe, expect, it } from 'vitest'
import { MAX_SAFE_URL_LENGTH, safeHttpsUrl } from './safeUrl'

describe('safeHttpsUrl', () => {
  it('accepts well-formed https URLs and returns them unchanged', () => {
    expect(safeHttpsUrl('https://example.com')).toBe('https://example.com')
    expect(safeHttpsUrl('https://nhcp.gov.ph/resources/rizal?x=1#top')).toBe(
      'https://nhcp.gov.ph/resources/rizal?x=1#top',
    )
  })

  it('trims surrounding whitespace', () => {
    expect(safeHttpsUrl('  https://example.com/a  ')).toBe('https://example.com/a')
  })

  it('accepts an uppercase scheme because the URL parser lowercases it', () => {
    expect(safeHttpsUrl('HTTPS://example.com/a')).toBe('HTTPS://example.com/a')
  })

  it.each([
    ['http', 'http://example.com'],
    ['javascript', 'javascript:alert(1)'],
    ['javascript with tab', 'java\tscript:alert(1)'],
    ['javascript uppercase', 'JAVASCRIPT:alert(1)'],
    ['data', 'data:text/html;base64,PHNjcmlwdD4='],
    ['vbscript', 'vbscript:msgbox(1)'],
    ['file', 'file:///etc/passwd'],
    ['protocol relative', '//example.com'],
    ['relative path', '/path/only'],
    ['no scheme', 'example.com'],
    ['credentials', 'https://user:pass@example.com'],
    ['username only', 'https://user@example.com'],
    ['inner whitespace', 'https://exa mple.com'],
    ['newline', 'https://example.com/\nonclick=1'],
    ['empty host', 'https://'],
    ['empty string', ''],
    ['only spaces', '   '],
  ])('rejects %s', (_label, value) => {
    expect(safeHttpsUrl(value)).toBeNull()
  })

  it('rejects non-string values', () => {
    expect(safeHttpsUrl(undefined)).toBeNull()
    expect(safeHttpsUrl(null)).toBeNull()
    expect(safeHttpsUrl(42)).toBeNull()
    expect(safeHttpsUrl({ href: 'https://example.com' })).toBeNull()
  })

  it('rejects URLs longer than the maximum length', () => {
    const tooLong = `https://example.com/${'a'.repeat(MAX_SAFE_URL_LENGTH)}`
    expect(safeHttpsUrl(tooLong)).toBeNull()
    const justRight = `https://example.com/${'a'.repeat(MAX_SAFE_URL_LENGTH - 'https://example.com/'.length)}`
    expect(safeHttpsUrl(justRight)).toBe(justRight)
  })
})
