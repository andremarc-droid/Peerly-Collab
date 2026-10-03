import type { DriveKind } from './types'

export type LinkErrorCode = 'invalid_url' | 'unsupported_host' | 'folder' | 'invalid_id'
export class LinkParseError extends Error {
  code: LinkErrorCode
  constructor(code: LinkErrorCode, message: string) { super(message); this.code = code; this.name = 'LinkParseError' }
}
const idPattern = /^[\w-]{10,200}$/
const stripControls = (input: string) => [...input].filter((char) => { const code = char.charCodeAt(0); return code >= 32 && code !== 127 }).join('')

function safeUrl(input: string): URL {
  const cleaned = stripControls(input).trim()
  if (cleaned.length > 2000) throw new LinkParseError('invalid_url', 'URL is too long.')
  try { const url = new URL(cleaned); if (url.protocol !== 'https:' || url.username || url.password) throw new Error(); return url }
  catch { throw new LinkParseError('invalid_url', 'Enter a valid HTTPS URL without user information.') }
}

export function normalizeGenericUrl(input: string): string {
  const cleaned = stripControls(input).trim()
  if (cleaned.length > 2000) throw new LinkParseError('invalid_url', 'URL is too long.')
  try { const url = new URL(cleaned); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(); return url.toString() }
  catch { throw new LinkParseError('invalid_url', 'Enter a valid HTTP or HTTPS URL.') }
}

export function parseDriveUrl(input: string): { fileId: string; kind: DriveKind } {
  const url = safeUrl(input)
  if (url.hostname !== 'drive.google.com' && url.hostname !== 'docs.google.com') throw new LinkParseError('unsupported_host', 'Use a Google Drive or Docs file link.')
  if (url.hostname === 'drive.google.com' && url.pathname.startsWith('/drive/folders/')) throw new LinkParseError('folder', 'Folders are not supported, share a single file.')
  let fileId = ''; let kind: DriveKind = 'file'
  const path = url.pathname
  if (url.hostname === 'drive.google.com') {
    const match = path.match(/^\/file\/d\/([^/]+)\/(?:view|preview|edit)\/?$/)
    if (match) fileId = match[1]
    else if (['/open', '/uc'].includes(path)) fileId = url.searchParams.get('id') ?? ''
  } else {
    const match = path.match(/^\/(document|spreadsheets|presentation)\/d\/([^/]+)\/(?:edit|view|preview|embed|pub)\/?$/)
    if (match) { kind = match[1] === 'document' ? 'doc' : match[1] === 'spreadsheets' ? 'sheet' : 'slides'; fileId = match[2] }
  }
  if (!fileId || !idPattern.test(fileId)) throw new LinkParseError('invalid_id', 'The Google file link is not supported.')
  return { fileId, kind }
}

export function parseYouTubeUrl(input: string): string {
  const url = safeUrl(input)
  if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname)) throw new LinkParseError('unsupported_host', 'Use a YouTube video link.')
  let id = ''
  if (url.hostname === 'youtu.be') id = url.pathname.split('/')[1] ?? ''
  else if (url.pathname === '/watch') id = url.searchParams.get('v') ?? ''
  else { const match = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/); if (match) id = match[1] }
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new LinkParseError('invalid_id', 'The YouTube video link is not supported.')
  return id
}

// Keep all kind-specific Drive preview and open URL mappings here for manual verification.
export function buildDriveEmbedUrl(kind: DriveKind, id: string): string { if (!idPattern.test(id)) throw new LinkParseError('invalid_id', 'Invalid Drive file ID.'); const host = kind === 'file' ? 'drive.google.com/file' : `docs.google.com/${kind === 'doc' ? 'document' : kind === 'sheet' ? 'spreadsheets' : 'presentation'}`; return `https://${host}/d/${id}/preview` }
export function buildDriveOpenUrl(kind: DriveKind, id: string): string { if (!idPattern.test(id)) throw new LinkParseError('invalid_id', 'Invalid Drive file ID.'); const host = kind === 'file' ? 'drive.google.com/file' : `docs.google.com/${kind === 'doc' ? 'document' : kind === 'sheet' ? 'spreadsheets' : 'presentation'}`; return `https://${host}/d/${id}/view` }
export function buildYouTubeEmbedUrl(id: string): string { if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new LinkParseError('invalid_id', 'Invalid YouTube video ID.'); return `https://www.youtube-nocookie.com/embed/${id}` }
export function isEmbeddableHost(input: string): boolean { try { const url = safeUrl(input); return ['drive.google.com', 'docs.google.com', 'www.youtube-nocookie.com'].includes(url.hostname) } catch { return false } }
