import { describe, expect, it } from 'vitest'
import { isSupportedYoutubeUrl } from './youtubeTranscript'

describe('isSupportedYoutubeUrl', () => {
  it('accepts HTTPS watch, short and embed links', () => {
    expect(isSupportedYoutubeUrl('https://www.youtube.com/watch?v=abcdefghijk')).toBe(true)
    expect(isSupportedYoutubeUrl('https://youtu.be/abcdefghijk')).toBe(true)
    expect(isSupportedYoutubeUrl('https://youtube-nocookie.com/embed/abcdefghijk')).toBe(true)
  })
  it('rejects malformed ids, HTTP and deceptive domains', () => {
    expect(isSupportedYoutubeUrl('http://youtube.com/watch?v=abcdefghijk')).toBe(false)
    expect(isSupportedYoutubeUrl('https://youtube.com.evil.test/watch?v=abcdefghijk')).toBe(false)
    expect(isSupportedYoutubeUrl('https://youtube.com/watch?v=short')).toBe(false)
  })
})
