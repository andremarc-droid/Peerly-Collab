export interface TranscriptTrack { language: string; name: string }
export interface YoutubeTranscript { videoId: string; title: string; language: string; transcript: string }
export interface TranscriptProvider {
  getTracks(videoId: string): Promise<TranscriptTrack[]>
  getTranscript(videoId: string, language: string): Promise<string>
  getTitle(videoId: string): Promise<string>
}
export interface RateLimitStore { consume(uid: string, now: number, limit: number, windowMs: number): Promise<boolean> }
export type CallableFailure = 'unauthenticated' | 'invalid-argument' | 'resource-exhausted' | 'not-found' | 'unavailable'
export class TranscriptFailure extends Error {
  constructor(readonly code: CallableFailure, message: string) { super(message); this.name = 'TranscriptFailure' }
}
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com'])
export const TRANSCRIPT_MAX_CHARS = 20000

export function parseYoutubeVideoId(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 2048) return null
  try {
    const url = new URL(input)
    if (url.protocol !== 'https:' || url.username || url.password || !HOSTS.has(url.hostname.toLowerCase())) return null
    const host = url.hostname.toLowerCase()
    let id: string | null = null
    if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] ?? null
    else if (url.pathname === '/watch') id = url.searchParams.get('v')
    else {
      const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)$/)
      id = match?.[1] ?? null
    }
    return id && VIDEO_ID.test(id) ? id : null
  } catch { return null }
}

export async function fetchTranscriptForUser(
  uid: string | null,
  rawUrl: unknown,
  dependencies: { provider: TranscriptProvider; limits: RateLimitStore; now?: number },
): Promise<YoutubeTranscript> {
  if (!uid) throw new TranscriptFailure('unauthenticated', 'Sign in to import a transcript.')
  const videoId = parseYoutubeVideoId(rawUrl)
  if (!videoId) throw new TranscriptFailure('invalid-argument', 'Enter a valid HTTPS YouTube video URL.')
  const now = dependencies.now ?? Date.now()
  if (!(await dependencies.limits.consume(uid, now, 10, 60 * 60 * 1000))) {
    throw new TranscriptFailure('resource-exhausted', 'Transcript import limit reached. Paste the transcript instead or try again later.')
  }
  try {
    const tracks = await dependencies.provider.getTracks(videoId)
    if (!tracks.length) throw new TranscriptFailure('not-found', 'No transcript is available for this video. Paste a transcript instead.')
    const track = tracks.find(item => item.language.toLowerCase().startsWith('en')) ?? tracks[0]!
    const transcript = (await dependencies.provider.getTranscript(videoId, track.language)).trim()
    if (!transcript) throw new TranscriptFailure('not-found', 'This video has no readable transcript. Paste a transcript instead.')
    return { videoId, title: (await dependencies.provider.getTitle(videoId)).slice(0, 200), language: track.language, transcript: transcript.slice(0, TRANSCRIPT_MAX_CHARS) }
  } catch (error) {
    if (error instanceof TranscriptFailure) throw error
    throw new TranscriptFailure('unavailable', 'YouTube transcript service is temporarily unavailable. Paste a transcript instead.')
  }
}

function decodeXml(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
}

async function fetchYouTube(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error('YouTube request failed')
  return response.text()
}

/** Uses fixed YouTube endpoints and a validated video id; never fetches user-provided URLs. */
export const youtubeTimedTextProvider: TranscriptProvider = {
  async getTracks(videoId) {
    const xml = await fetchYouTube(`https://www.youtube.com/api/timedtext?type=list&v=${videoId}`)
    return [...xml.matchAll(/<track\b([^>]*)\/?\s*>/g)].map(match => {
      const attrs = Object.fromEntries([...match[1]!.matchAll(/([\w-]+)="([^"]*)"/g)].map(item => [item[1]!, decodeXml(item[2]!)]))
      return { language: attrs.lang_code ?? '', name: attrs.name ?? '' }
    }).filter(track => track.language)
  },
  async getTranscript(videoId, language) {
    const xml = await fetchYouTube(`https://www.youtube.com/api/timedtext?fmt=srv3&lang=${encodeURIComponent(language)}&v=${videoId}`)
    return [...xml.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(match => decodeXml(match[1]!.replace(/<[^>]+>/g, ' '))).join(' ').replace(/\s+/g, ' ').trim()
  },
  async getTitle(videoId) {
    try {
      const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`, { signal: AbortSignal.timeout(5000) })
      if (!response.ok) return 'YouTube video'
      const data: unknown = await response.json()
      return typeof data === 'object' && data !== null && 'title' in data && typeof data.title === 'string' ? data.title : 'YouTube video'
    } catch { return 'YouTube video' }
  },
}
