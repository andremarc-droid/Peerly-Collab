import { httpsCallable } from 'firebase/functions'
import { functions } from '../../lib/firebase/functions'

export interface YoutubeTranscriptResult { videoId: string; title: string; language: string; transcript: string }
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com'])

export function isSupportedYoutubeUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || !HOSTS.has(url.hostname.toLowerCase())) return false
    const id = url.hostname.toLowerCase() === 'youtu.be'
      ? url.pathname.split('/').filter(Boolean)[0]
      : url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)$/)?.[1]
    return Boolean(id && /^[A-Za-z0-9_-]{11}$/.test(id))
  } catch { return false }
}

export async function requestYoutubeTranscript(url: string): Promise<YoutubeTranscriptResult> {
  if (!isSupportedYoutubeUrl(url)) throw new Error('Enter a valid HTTPS YouTube video URL.')
  const callable = httpsCallable<{ url: string }, YoutubeTranscriptResult>(functions, 'fetchYoutubeTranscript')
  const response = await callable({ url })
  if (!response.data || typeof response.data.transcript !== 'string' || typeof response.data.title !== 'string') throw new Error('The transcript service returned invalid data.')
  return response.data
}
