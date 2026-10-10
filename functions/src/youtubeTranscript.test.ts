import { describe, expect, it, vi } from 'vitest'
import { fetchTranscriptForUser, parseYoutubeVideoId, TranscriptFailure, type RateLimitStore, type TranscriptProvider } from './youtubeTranscript.js'

const provider: TranscriptProvider = {
  getTracks: vi.fn(async () => [{ language: 'en', name: 'English' }]),
  getTranscript: vi.fn(async () => 'A useful transcript.'),
  getTitle: vi.fn(async () => 'Biology'),
}
const allowed: RateLimitStore = { consume: vi.fn(async () => true) }

describe('YouTube transcript import', () => {
  it('accepts supported HTTPS URL forms and rejects unsafe lookalikes', () => {
    expect(parseYoutubeVideoId('https://www.youtube.com/watch?v=abcdefghijk')).toBe('abcdefghijk')
    expect(parseYoutubeVideoId('https://youtu.be/abcdefghijk')).toBe('abcdefghijk')
    expect(parseYoutubeVideoId('https://youtube.com.evil.test/watch?v=abcdefghijk')).toBeNull()
    expect(parseYoutubeVideoId('javascript:alert(1)')).toBeNull()
    expect(parseYoutubeVideoId('http://youtube.com/watch?v=abcdefghijk')).toBeNull()
  })

  it('returns transcript metadata and caps text', async () => {
    const result = await fetchTranscriptForUser('student', 'https://youtu.be/abcdefghijk', { provider, limits: allowed, now: 100 })
    expect(result).toMatchObject({ title: 'Biology', language: 'en', transcript: 'A useful transcript.' })
  })

  it('rejects unauthenticated users and enforces the quota before provider access', async () => {
    await expect(fetchTranscriptForUser(null, 'https://youtu.be/abcdefghijk', { provider, limits: allowed })).rejects.toMatchObject({ code: 'unauthenticated' })
    const denied: RateLimitStore = { consume: vi.fn(async () => false) }
    const blockedProvider: TranscriptProvider = {
      getTracks: vi.fn(async () => [{ language: 'en', name: 'English' }]),
      getTranscript: vi.fn(async () => 'text'),
      getTitle: vi.fn(async () => 'title'),
    }
    await expect(fetchTranscriptForUser('student', 'https://youtu.be/abcdefghijk', { provider: blockedProvider, limits: denied })).rejects.toBeInstanceOf(TranscriptFailure)
    expect(blockedProvider.getTracks).not.toHaveBeenCalled()
  })

  it('returns a friendly unavailable transcript state', async () => {
    const noTracks: TranscriptProvider = { ...provider, getTracks: vi.fn(async () => []) }
    await expect(fetchTranscriptForUser('student', 'https://youtu.be/abcdefghijk', { provider: noTracks, limits: allowed })).rejects.toMatchObject({ code: 'not-found' })
  })
})
