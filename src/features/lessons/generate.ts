import { aiComplete, aiJson, AiError, isAbortError, type AiComplete } from '../studyEngine/ai'
import { chunkImportText } from '../flashcards/importGeneration'
import { parseLesson, parseOutline } from './schemas'
import { buildLessonPrompt, buildOutlinePrompt } from './prompts'
import type { LessonLevel, LessonPlanOutline, LessonRecord } from './types'

export type LessonGenerationFailure = 'rate-limit' | 'unavailable' | 'invalid-reply'
export interface GenerateLessonPlanOptions { topic: string; level: LessonLevel; lessonCount: number; sourceText?: string; signal?: AbortSignal; complete?: AiComplete; onProgress?: (completed: number, total: number) => void }
export interface GeneratedLessonPlan { outline: LessonPlanOutline; lessons: Record<string, Omit<LessonRecord, 'updatedAt'>>; failedLessonIds: string[]; status: 'ready' | 'partial'; failureReason?: LessonGenerationFailure; cancelled: boolean; sourceCapped: boolean }
function generatedLesson(value: unknown): Omit<LessonRecord, 'updatedAt'> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  try {
    const parsed = parseLesson({ ...(value as Record<string, unknown>), updatedAt: { toMillis: () => 0 } })
    const { title, objective, content, keyPoints, flashcards, quiz } = parsed
    return { title, objective, content, keyPoints, flashcards, quiz }
  } catch { return null }
}
const reason = (error: unknown): LessonGenerationFailure => error instanceof AiError ? error.reason : 'unavailable'

export async function generateLessonPlan(options: GenerateLessonPlanOptions): Promise<GeneratedLessonPlan> {
  const complete = options.complete ?? ((prompt, signal, settings) => aiComplete(prompt, { signal, ...settings }))
  const source = chunkImportText(options.sourceText ?? '')
  const sourceChunks = source.chunks
  const outline = await aiJson(buildOutlinePrompt(options.topic, options.level, options.lessonCount, sourceChunks[0] ?? ''), value => { try { return parseOutline(value, options.lessonCount) } catch { return null } }, { complete, signal: options.signal, maxTokens: 1200, temperature: 0.35 })
  const lessons: GeneratedLessonPlan['lessons'] = {}
  const failedLessonIds: string[] = []
  let failureReason: LessonGenerationFailure | undefined
  for (let index = 0; index < outline.lessons.length; index += 1) {
    if (options.signal?.aborted) return { outline, lessons, failedLessonIds: outline.lessons.slice(index).map(item => item.id), status: 'partial', cancelled: true, sourceCapped: source.capped }
    const item = outline.lessons[index]!
    options.onProgress?.(index + 1, outline.lessons.length)
    const sourceChunk = sourceChunks.length ? sourceChunks[Math.min(sourceChunks.length - 1, Math.floor(index * sourceChunks.length / outline.lessons.length))]! : ''
    try {
      const result = await aiJson(buildLessonPrompt(outline, item.id, options.level, sourceChunk), generatedLesson, { complete, signal: options.signal, maxTokens: 1800, temperature: 0.4 })
      lessons[item.id] = result
    } catch (error) {
      if (isAbortError(error) || options.signal?.aborted) return { outline, lessons, failedLessonIds: outline.lessons.slice(index).map(entry => entry.id), status: 'partial', cancelled: true, sourceCapped: source.capped }
      failureReason = reason(error)
      failedLessonIds.push(...outline.lessons.slice(index).map(entry => entry.id))
      break
    }
  }
  return { outline, lessons, failedLessonIds, status: failedLessonIds.length ? 'partial' : 'ready', ...(failureReason ? { failureReason } : {}), cancelled: false, sourceCapped: source.capped }
}

export async function generateRemainingLessons(options: GenerateLessonPlanOptions & { outline: LessonPlanOutline; existing: Record<string, Omit<LessonRecord, 'updatedAt'>>; lessonIds: string[] }): Promise<GeneratedLessonPlan> {
  const complete = options.complete ?? ((prompt, signal, settings) => aiComplete(prompt, { signal, ...settings }))
  const source = chunkImportText(options.sourceText ?? '')
  const lessons = { ...options.existing }
  const failedLessonIds: string[] = []
  let failureReason: LessonGenerationFailure | undefined
  for (let index = 0; index < options.lessonIds.length; index += 1) {
    const lessonId = options.lessonIds[index]!
    if (options.signal?.aborted) return { outline: options.outline, lessons, failedLessonIds: options.lessonIds.slice(index), status: 'partial', cancelled: true, sourceCapped: source.capped }
    options.onProgress?.(index + 1, options.lessonIds.length)
    const sourceChunk = source.chunks.length ? source.chunks[Math.min(source.chunks.length - 1, Math.floor(index * source.chunks.length / options.lessonIds.length))]! : ''
    try { lessons[lessonId] = await aiJson(buildLessonPrompt(options.outline, lessonId, options.level, sourceChunk), generatedLesson, { complete, signal: options.signal, maxTokens: 1800, temperature: 0.4 }) }
    catch (error) {
      if (isAbortError(error) || options.signal?.aborted) return { outline: options.outline, lessons, failedLessonIds: options.lessonIds.slice(index), status: 'partial', cancelled: true, sourceCapped: source.capped }
      failureReason = reason(error); failedLessonIds.push(...options.lessonIds.slice(index)); break
    }
  }
  return { outline: options.outline, lessons, failedLessonIds, status: failedLessonIds.length ? 'partial' : 'ready', ...(failureReason ? { failureReason } : {}), cancelled: false, sourceCapped: source.capped }
}

export async function regenerateLesson(options: { outline: LessonPlanOutline; lessonId: string; level: LessonLevel; sourceText?: string; signal?: AbortSignal; complete?: AiComplete }): Promise<Omit<LessonRecord, 'updatedAt'>> {
  const result = await generateRemainingLessons({ topic: options.outline.title, level: options.level, lessonCount: options.outline.lessons.length, outline: options.outline, sourceText: options.sourceText, signal: options.signal, complete: options.complete, existing: {}, lessonIds: [options.lessonId] })
  if (result.status !== 'ready') throw new AiError(result.failureReason ?? 'unavailable', 'The lesson could not be regenerated. The previous version is unchanged.')
  const generated = result.lessons[options.lessonId]!
  const original = options.outline.lessons.find(lesson => lesson.id === options.lessonId)!
  return { ...generated, title: original.title, objective: original.objective }
}
