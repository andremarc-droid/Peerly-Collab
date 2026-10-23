import type {
  SharedCanvasPayload,
  SharedDeckPayload,
  SharedGroupItem,
  SharedItemKind,
  SharedLessonPlanPayload,
  SharedNotePayload,
} from './types'

export const GROUP_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const GROUP_CODE_LENGTH = 6
export const MAX_GROUP_MEMBERS = 50
export const MAX_GROUP_ITEMS = 100

export const MAX_SHARED_CARDS = 100
export const MAX_SHARED_CARD_FRONT = 300
export const MAX_SHARED_CARD_BACK = 600

export const MAX_SHARED_CANVAS_NODES = 80
export const MAX_SHARED_CANVAS_EDGES = 120

export const MAX_SHARED_LESSON_COUNT = 20
export const MAX_SHARED_NOTE_TEXT = 20000

export const MAX_SHARED_TITLE_LENGTH = 120
export const MAX_SHARED_SUMMARY_LENGTH = 300

export function generateGroupInviteCode(): string {
  const code: string[] = []
  const randomUpperBound = Math.floor(256 / GROUP_CODE_ALPHABET.length) * GROUP_CODE_ALPHABET.length
  while (code.length < GROUP_CODE_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(GROUP_CODE_LENGTH))
    for (const byte of bytes) {
      if (byte < randomUpperBound) code.push(GROUP_CODE_ALPHABET[byte % GROUP_CODE_ALPHABET.length])
      if (code.length === GROUP_CODE_LENGTH) break
    }
  }
  return code.join('')
}

export function normalizeGroupInviteCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '')
}

export function validateGroupName(name: string): { valid: boolean; error?: string } {
  const trimmed = name.trim()
  if (!trimmed) return { valid: false, error: 'Group name is required.' }
  if (trimmed.length > 80) return { valid: false, error: 'Group name must be 80 characters or less.' }
  return { valid: true }
}

export function validateGroupDescription(desc?: string): { valid: boolean; error?: string } {
  if (!desc) return { valid: true }
  if (desc.trim().length > 300) {
    return { valid: false, error: 'Description must be 300 characters or less.' }
  }
  return { valid: true }
}

export function buildSharedDeckPayload(
  cards: Array<{ id: string; front: string; back: string }>,
  sourceClassId?: string,
): SharedDeckPayload {
  const capped = cards.slice(0, MAX_SHARED_CARDS).map((c) => ({
    id: String(c.id || ''),
    front: String(c.front || '').trim().slice(0, MAX_SHARED_CARD_FRONT),
    back: String(c.back || '').trim().slice(0, MAX_SHARED_CARD_BACK),
  }))
  return {
    cardCount: capped.length,
    cards: capped,
    ...(sourceClassId ? { sourceClassId } : {}),
  }
}

export function buildSharedCanvasPayload(
  nodes: any[],
  edges: any[],
  viewport?: { x: number; y: number; zoom: number },
  sourceClassId?: string,
): SharedCanvasPayload {
  const safeNodes = (nodes || []).slice(0, MAX_SHARED_CANVAS_NODES)
  const safeEdges = (edges || []).slice(0, MAX_SHARED_CANVAS_EDGES)
  return {
    nodeCount: safeNodes.length,
    edgeCount: safeEdges.length,
    nodes: safeNodes,
    edges: safeEdges,
    viewport: viewport || { x: 0, y: 0, zoom: 1 },
    ...(sourceClassId ? { sourceClassId } : {}),
  }
}

export function buildSharedLessonPlanPayload(
  topic: string,
  level: string,
  order: string[],
  lessons: Record<string, any>,
): SharedLessonPlanPayload {
  const safeOrder = (order || []).slice(0, MAX_SHARED_LESSON_COUNT)
  const safeLessons: SharedLessonPlanPayload['lessons'] = {}

  for (const id of safeOrder) {
    const raw = lessons[id]
    if (raw) {
      safeLessons[id] = {
        title: String(raw.title || '').trim().slice(0, 120),
        objective: String(raw.objective || '').trim().slice(0, 300),
        content: String(raw.content || '').slice(0, 20000),
        keyPoints: Array.isArray(raw.keyPoints)
          ? raw.keyPoints.slice(0, 10).map((k: any) => String(k).slice(0, 200))
          : [],
        ...(Array.isArray(raw.flashcards)
          ? {
              flashcards: raw.flashcards.slice(0, 50).map((f: any) => ({
                id: String(f.id || ''),
                front: String(f.front || '').slice(0, 300),
                back: String(f.back || '').slice(0, 600),
              })),
            }
          : {}),
        ...(Array.isArray(raw.quiz) ? { quiz: raw.quiz.slice(0, 20) } : {}),
      }
    }
  }

  return {
    topic: String(topic || '').trim().slice(0, 500),
    level: String(level || 'beginner'),
    lessonCount: safeOrder.length,
    order: safeOrder,
    lessons: safeLessons,
  }
}

export function buildSharedNotePayload(
  text: string,
  sourceClassId?: string,
): SharedNotePayload {
  return {
    text: String(text || '').slice(0, MAX_SHARED_NOTE_TEXT),
    ...(sourceClassId ? { sourceClassId } : {}),
  }
}

export function validateSharedDeckPayload(payload: unknown): { valid: boolean; error?: string } {
  if (!payload || typeof payload !== 'object') return { valid: false, error: 'Payload must be an object' }
  const p = payload as Partial<SharedDeckPayload>
  if (!Array.isArray(p.cards)) return { valid: false, error: 'Cards array is required' }
  if (p.cards.length === 0) return { valid: false, error: 'Deck must have at least 1 card' }
  if (p.cards.length > MAX_SHARED_CARDS) return { valid: false, error: `Deck cannot exceed ${MAX_SHARED_CARDS} cards` }
  for (const c of p.cards) {
    if (!c.front || c.front.length > MAX_SHARED_CARD_FRONT) return { valid: false, error: 'Card front is invalid' }
    if (!c.back || c.back.length > MAX_SHARED_CARD_BACK) return { valid: false, error: 'Card back is invalid' }
  }
  return { valid: true }
}

export function validateSharedCanvasPayload(payload: unknown): { valid: boolean; error?: string } {
  if (!payload || typeof payload !== 'object') return { valid: false, error: 'Payload must be an object' }
  const p = payload as Partial<SharedCanvasPayload>
  if (!Array.isArray(p.nodes)) return { valid: false, error: 'Nodes array is required' }
  if (!Array.isArray(p.edges)) return { valid: false, error: 'Edges array is required' }
  if (p.nodes.length > MAX_SHARED_CANVAS_NODES) return { valid: false, error: `Nodes cannot exceed ${MAX_SHARED_CANVAS_NODES}` }
  if (p.edges.length > MAX_SHARED_CANVAS_EDGES) return { valid: false, error: `Edges cannot exceed ${MAX_SHARED_CANVAS_EDGES}` }
  return { valid: true }
}

export function validateSharedLessonPlanPayload(payload: unknown): { valid: boolean; error?: string } {
  if (!payload || typeof payload !== 'object') return { valid: false, error: 'Payload must be an object' }
  const p = payload as Partial<SharedLessonPlanPayload>
  if (p as any && 'source' in (p as any)) return { valid: false, error: 'Lesson plan source must not be shared' }
  if (!Array.isArray(p.order)) return { valid: false, error: 'Order array is required' }
  if (p.order.length > MAX_SHARED_LESSON_COUNT) return { valid: false, error: `Lessons cannot exceed ${MAX_SHARED_LESSON_COUNT}` }
  if (!p.lessons || typeof p.lessons !== 'object') return { valid: false, error: 'Lessons map is required' }
  return { valid: true }
}

export function validateSharedNotePayload(payload: unknown): { valid: boolean; error?: string } {
  if (!payload || typeof payload !== 'object') return { valid: false, error: 'Payload must be an object' }
  const p = payload as Partial<SharedNotePayload>
  if (typeof p.text !== 'string') return { valid: false, error: 'Note text must be a string' }
  if (p.text.length > MAX_SHARED_NOTE_TEXT) return { valid: false, error: `Note cannot exceed ${MAX_SHARED_NOTE_TEXT} characters` }
  return { valid: true }
}

export function validateSharedItem(item: unknown): { valid: boolean; error?: string } {
  if (!item || typeof item !== 'object') return { valid: false, error: 'Item must be an object' }
  const it = item as Partial<SharedGroupItem>
  if (!it.id || typeof it.id !== 'string') return { valid: false, error: 'Item id is required' }
  if (!it.title || typeof it.title !== 'string' || it.title.trim().length === 0 || it.title.length > MAX_SHARED_TITLE_LENGTH) {
    return { valid: false, error: 'Title is required (max 120 characters)' }
  }
  if (it.summary && it.summary.length > MAX_SHARED_SUMMARY_LENGTH) {
    return { valid: false, error: 'Summary cannot exceed 300 characters' }
  }
  const allowedKinds: SharedItemKind[] = ['deck', 'canvas', 'lessonPlan', 'note']
  if (!it.kind || !allowedKinds.includes(it.kind)) {
    return { valid: false, error: 'Invalid item kind' }
  }

  switch (it.kind) {
    case 'deck':
      return validateSharedDeckPayload(it.payload)
    case 'canvas':
      return validateSharedCanvasPayload(it.payload)
    case 'lessonPlan':
      return validateSharedLessonPlanPayload(it.payload)
    case 'note':
      return validateSharedNotePayload(it.payload)
    default:
      return { valid: false, error: 'Unsupported kind' }
  }
}
