import type { ModuleRecord, ModuleResource } from './types'

export function parseModule(value: unknown): ModuleRecord {
  if (!value || typeof value !== 'object') throw new Error('Invalid module.')
  const v = value as Record<string, unknown>
  if (typeof v.ownerId !== 'string' || typeof v.title !== 'string' || !v.title.trim() || v.title.length > 120 || typeof v.description !== 'string' || v.description.length > 1000 || typeof v.order !== 'number' || !Number.isFinite(v.order) || !['draft', 'published'].includes(String(v.status)) || !Array.isArray(v.quizIds) || v.quizIds.length > 10 || !v.quizIds.every((id) => typeof id === 'string') || typeof v.resourceCount !== 'number' || v.resourceCount < 0 || v.resourceCount > 10 || !v.createdAt || !v.updatedAt) throw new Error('Invalid module fields.')
  return v as unknown as ModuleRecord
}

export function parseResource(value: unknown): ModuleResource {
  if (!value || typeof value !== 'object') throw new Error('Invalid resource.')
  const v = value as Record<string, unknown>
  if (!['drive', 'youtube', 'link', 'text'].includes(String(v.type)) || typeof v.title !== 'string' || !v.title.trim() || v.title.length > 120 || typeof v.order !== 'number' || !Number.isFinite(v.order) || !v.createdAt || !v.updatedAt) throw new Error('Invalid resource fields.')
  if (v.type === 'text' ? typeof v.body !== 'string' || v.body.length > 5000 : typeof v.url !== 'string' || v.url.length > 2000 || !v.url.startsWith('https://')) throw new Error('Invalid resource content.')
  return v as unknown as ModuleResource
}
