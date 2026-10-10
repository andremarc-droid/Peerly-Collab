import { aiComplete, aiJson, AiError, isAbortError, type AiComplete } from '../studyEngine/ai'
import { chunkImportText } from '../flashcards/importGeneration'
import { parseLesson, parseOutline } from './schemas'
import { buildLessonPrompt, buildOutlinePrompt } from './prompts'
import type { LessonLevel, LessonPlanOutline, LessonRecord } from './types'

export type LessonGenerationFailure = 'rate-limit' | 'unavailable' | 'invalid-reply'
export interface GenerateLessonPlanOptions { topic: string; level: LessonLevel; lessonCount: number; sourceText?: string; signal?: AbortSignal; complete?: AiComplete; onProgress?: (completed: number, total: number) => void }
export interface GeneratedLessonPlan { outline: LessonPlanOutline; lessons: Record<string, Omit<LessonRecord, 'updatedAt'>>; failedLessonIds: string[]; status: 'ready' | 'partial'; failureReason?: LessonGenerationFailure; retryAfterSeconds?: number; cancelled: boolean; sourceCapped: boolean }
const clip = (value: unknown, max: number): unknown => typeof value === 'string' ? value.trim().slice(0, max) : value
const safeId = (value: unknown, fallback: string): string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : fallback

function normalizeQuestion(raw: unknown, index: number): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw
  const question = raw as Record<string, unknown>
  const id = safeId(question.id, `q-${index + 1}`)
  const prompt = clip(question.prompt ?? question.question, 500)
  const explanation = typeof question.explanation === 'string' ? clip(question.explanation, 500) : ''
  const answer = clip(question.answer, 600)
  const options = Array.isArray(question.options) ? question.options.map(option => clip(option, 300)) : undefined
  if (question.kind !== 'written' && options && options.length >= 2 && options.length <= 4) {
    let correctIndex = question.correctIndex
    if (!Number.isInteger(correctIndex) && typeof answer === 'string' && options.includes(answer)) correctIndex = options.indexOf(answer)
    if (Number.isInteger(correctIndex) && (correctIndex as number) >= 0 && (correctIndex as number) < options.length) {
      return { id, kind: 'multiple-choice', prompt, answer: options[correctIndex as number], options, correctIndex, explanation }
    }
  }
  if (typeof answer !== 'string' || !answer) return raw
  return { id, kind: 'written', prompt, answer, explanation }
}

/** Models drift from the exact shape (extra fields, over-long text, missing ids). Tidy what is safe to fix; the strict parser still decides. */
function normalizeLesson(value: Record<string, unknown>): Record<string, unknown> {
  return {
    title: clip(value.title, 120),
    objective: clip(value.objective, 300),
    content: clip(value.content, 2000),
    // Firestore rules allow at most 5 key points, 6 flashcards and 4 quiz questions per lesson (see firestore.rules).
    keyPoints: Array.isArray(value.keyPoints) ? value.keyPoints.slice(0, 5).map(point => clip(point, 200)) : value.keyPoints,
    flashcards: Array.isArray(value.flashcards) ? value.flashcards.slice(0, 6).map((card, index) => {
      if (typeof card !== 'object' || card === null || Array.isArray(card)) return card
      const item = card as Record<string, unknown>
      return { id: safeId(item.id, `card-${index + 1}`), front: clip(item.front ?? item.question, 300), back: clip(item.back ?? item.answer, 600) }
    }) : value.flashcards,
    quiz: Array.isArray(value.quiz) ? value.quiz.slice(0, 4).map(normalizeQuestion) : value.quiz,
  }
}

function generatedLesson(value: unknown): Omit<LessonRecord, 'updatedAt'> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  try {
    const parsed = parseLesson({ ...normalizeLesson(value as Record<string, unknown>), updatedAt: { toMillis: () => 0 } })
    const { title, objective, content, keyPoints, flashcards, quiz } = parsed
    return { title, objective, content, keyPoints, flashcards, quiz }
  } catch (error) {
    console.warn('[lessons] reply rejected:', error instanceof Error ? error.message : error)
    return null
  }
}
const reason = (error: unknown): LessonGenerationFailure => error instanceof AiError ? error.reason : 'unavailable'
const retryAfter = (error: unknown): number | undefined => error instanceof AiError && error.retryAfterSeconds ? error.retryAfterSeconds : undefined

/** Gap between lesson requests so a plan stays inside Groq's per-minute token budget. Skipped when a custom `complete` is supplied (tests). */
const PAUSE_MS = 6_000
/** Longest rate-limit wait that is retried automatically; longer waits are reported to the user instead. */
const MAX_AUTO_WAIT_SECONDS = 60
const DEFAULT_AUTO_WAIT_SECONDS = 20

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal?.aborted) { resolve(); return }
    const done = () => { clearTimeout(timer); signal?.removeEventListener('abort', done); resolve() }
    const timer = setTimeout(done, ms)
    signal?.addEventListener('abort', done, { once: true })
  })
}

async function generateOne(run: () => Promise<Omit<LessonRecord, 'updatedAt'>>, paced: boolean, signal?: AbortSignal): Promise<Omit<LessonRecord, 'updatedAt'>> {
  try { return await run() } catch (error) {
    if (paced && error instanceof AiError && error.reason === 'rate-limit') {
      const seconds = error.retryAfterSeconds ?? DEFAULT_AUTO_WAIT_SECONDS
      if (seconds <= MAX_AUTO_WAIT_SECONDS) {
        await wait((seconds + 1) * 1000, signal)
        return run()
      }
    }
    throw error
  }
}

export async function generateLessonPlan(options: GenerateLessonPlanOptions): Promise<GeneratedLessonPlan> {
  const complete = options.complete ?? ((prompt, signal, settings) => aiComplete(prompt, { signal, maxTokens: settings?.maxTokens, temperature: settings?.temperature }))
  const source = chunkImportText(options.sourceText ?? '')
  const sourceChunks = source.chunks
  const outline = await aiJson(buildOutlinePrompt(options.topic, options.level, options.lessonCount, sourceChunks[0] ?? ''), value => { try { return parseOutline(value, options.lessonCount) } catch { return null } }, { complete, signal: options.signal, maxTokens: 1200, temperature: 0.35 })
  const lessons: GeneratedLessonPlan['lessons'] = {}
  const failedLessonIds: string[] = []
  let failureReason: LessonGenerationFailure | undefined
  let retryAfterSeconds: number | undefined
  for (let index = 0; index < outline.lessons.length; index += 1) {
    if (options.signal?.aborted) return { outline, lessons, failedLessonIds: outline.lessons.slice(index).map(item => item.id), status: 'partial', cancelled: true, sourceCapped: source.capped }
    const item = outline.lessons[index]!
    options.onProgress?.(index + 1, outline.lessons.length)
    const sourceChunk = sourceChunks.length ? sourceChunks[Math.min(sourceChunks.length - 1, Math.floor(index * sourceChunks.length / outline.lessons.length))]! : ''
    try {
      if (index > 0 && !options.complete) await wait(PAUSE_MS, options.signal)
      const result = await generateOne(() => aiJson(buildLessonPrompt(outline, item.id, options.level, sourceChunk), generatedLesson, { complete, signal: options.signal, maxTokens: 2400, temperature: 0.4 }), !options.complete, options.signal)
      lessons[item.id] = result
    } catch (error) {
      if (isAbortError(error) || options.signal?.aborted) return { outline, lessons, failedLessonIds: outline.lessons.slice(index).map(entry => entry.id), status: 'partial', cancelled: true, sourceCapped: source.capped }
      failureReason = reason(error)
      retryAfterSeconds = retryAfter(error)
      failedLessonIds.push(...outline.lessons.slice(index).map(entry => entry.id))
      break
    }
  }
  return { outline, lessons, failedLessonIds, status: failedLessonIds.length ? 'partial' : 'ready', ...(failureReason ? { failureReason } : {}), ...(retryAfterSeconds ? { retryAfterSeconds } : {}), cancelled: false, sourceCapped: source.capped }
}

export async function generateRemainingLessons(options: GenerateLessonPlanOptions & { outline: LessonPlanOutline; existing: Record<string, Omit<LessonRecord, 'updatedAt'>>; lessonIds: string[] }): Promise<GeneratedLessonPlan> {
  const complete = options.complete ?? ((prompt, signal, settings) => aiComplete(prompt, { signal, maxTokens: settings?.maxTokens, temperature: settings?.temperature }))
  const source = chunkImportText(options.sourceText ?? '')
  const lessons = { ...options.existing }
  const failedLessonIds: string[] = []
  let failureReason: LessonGenerationFailure | undefined
  let retryAfterSeconds: number | undefined
  for (let index = 0; index < options.lessonIds.length; index += 1) {
    const lessonId = options.lessonIds[index]!
    if (options.signal?.aborted) return { outline: options.outline, lessons, failedLessonIds: options.lessonIds.slice(index), status: 'partial', cancelled: true, sourceCapped: source.capped }
    options.onProgress?.(index + 1, options.lessonIds.length)
    const sourceChunk = source.chunks.length ? source.chunks[Math.min(source.chunks.length - 1, Math.floor(index * source.chunks.length / options.lessonIds.length))]! : ''
    try {
      if (index > 0 && !options.complete) await wait(PAUSE_MS, options.signal)
      lessons[lessonId] = await generateOne(() => aiJson(buildLessonPrompt(options.outline, lessonId, options.level, sourceChunk), generatedLesson, { complete, signal: options.signal, maxTokens: 2400, temperature: 0.4 }), !options.complete, options.signal)
    }
    catch (error) {
      if (isAbortError(error) || options.signal?.aborted) return { outline: options.outline, lessons, failedLessonIds: options.lessonIds.slice(index), status: 'partial', cancelled: true, sourceCapped: source.capped }
      failureReason = reason(error); retryAfterSeconds = retryAfter(error); failedLessonIds.push(...options.lessonIds.slice(index)); break
    }
  }
  return { outline: options.outline, lessons, failedLessonIds, status: failedLessonIds.length ? 'partial' : 'ready', ...(failureReason ? { failureReason } : {}), ...(retryAfterSeconds ? { retryAfterSeconds } : {}), cancelled: false, sourceCapped: source.capped }
}

export async function regenerateLesson(options: { outline: LessonPlanOutline; lessonId: string; level: LessonLevel; sourceText?: string; signal?: AbortSignal; complete?: AiComplete }): Promise<Omit<LessonRecord, 'updatedAt'>> {
  const result = await generateRemainingLessons({ topic: options.outline.title, level: options.level, lessonCount: options.outline.lessons.length, outline: options.outline, sourceText: options.sourceText, signal: options.signal, complete: options.complete, existing: {}, lessonIds: [options.lessonId] })
  if (result.status !== 'ready') throw new AiError(result.failureReason ?? 'unavailable', 'The lesson could not be regenerated. The previous version is unchanged.')
  const generated = result.lessons[options.lessonId]!
  const original = options.outline.lessons.find(lesson => lesson.id === options.lessonId)!
  return { ...generated, title: original.title, objective: original.objective }
}
