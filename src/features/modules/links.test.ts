import { describe, expect, it } from 'vitest'
import { buildDriveEmbedUrl, buildDriveOpenUrl, buildYouTubeEmbedUrl, isEmbeddableHost, LinkParseError, normalizeGenericUrl, parseDriveUrl, parseYouTubeUrl } from './links'

describe('Drive URL parsing', () => {
  it.each([
    ['https://drive.google.com/file/d/abcdefghijk/view?usp=sharing', 'file'],
    ['https://drive.google.com/open?id=abcdefghijk', 'file'],
    ['https://drive.google.com/uc?id=abcdefghijk', 'file'],
    ['https://docs.google.com/document/d/abcdefghijk/edit', 'doc'],
    ['https://docs.google.com/spreadsheets/d/abcdefghijk/preview?usp=sharing', 'sheet'],
    ['https://docs.google.com/presentation/d/abcdefghijk/embed', 'slides'],
  ] as const)('parses %s', (url, kind) => expect(parseDriveUrl(url).kind).toBe(kind))
  it('rejects folders, deceptive hosts, user info and huge URLs', () => {
    expect(() => parseDriveUrl('https://drive.google.com/drive/folders/abcdefghijk')).toThrow('Folders are not supported')
    for (const url of ['https://drive.google.com.evil.com/file/d/abcdefghijk/view', 'https://user@drive.google.com/file/d/abcdefghijk/view', `https://drive.google.com/${'x'.repeat(2100)}`]) expect(() => parseDriveUrl(url)).toThrow(LinkParseError)
  })
  it('builds kind-specific preview and open URLs', () => {
    expect(buildDriveEmbedUrl('doc', 'abcdefghijk')).toBe('https://docs.google.com/document/d/abcdefghijk/preview')
    expect(buildDriveOpenUrl('slides', 'abcdefghijk')).toBe('https://docs.google.com/presentation/d/abcdefghijk/view')
  })
})

describe('YouTube and generic links', () => {
  it.each(['https://youtube.com/watch?v=abcdefghijk', 'https://youtu.be/abcdefghijk', 'https://youtube.com/shorts/abcdefghijk', 'https://youtube.com/embed/abcdefghijk', 'https://youtube.com/live/abcdefghijk'])('parses %s', (url) => expect(parseYouTubeUrl(url)).toBe('abcdefghijk'))
  it('normalizes only safe links and restricts embeds', () => {
    expect(normalizeGenericUrl('https://example.com')).toBe('https://example.com/')
    for (const url of ['javascript:alert(1)', 'data:text/html,x', 'file:///tmp/a', 'https://u:p@example.com', `https://example.com/${'a'.repeat(2100)}`]) expect(() => normalizeGenericUrl(url)).toThrow()
    expect(isEmbeddableHost('https://drive.google.com')).toBe(true)
    expect(isEmbeddableHost('https://drive.google.com.evil.com')).toBe(false)
    expect(buildYouTubeEmbedUrl('abcdefghijk')).toBe('https://www.youtube-nocookie.com/embed/abcdefghijk')
  })
})
