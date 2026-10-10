import { useEffect, useRef, useState } from 'react'
import { AiError, isAbortError } from '../studyEngine/ai'
import { generateLessonPlan, generateRemainingLessons, type GeneratedLessonPlan } from './generate'
import { describeLessonGeneration } from './generationMessage'
import { createLessonPlan, saveLesson } from './services'
import type { LessonLevel, LessonPlan } from './types'

export interface LessonPlanBuilderInput {
  uid: string
  topic: string
  level: LessonLevel
  lessonCount: number
  sourceText: string
}

/**
 * Generates a lesson plan with the shared AI wrapper and saves it as it goes.
 * Completed lessons are always kept: a failed or stopped run leaves a partial plan
 * that `start(true)` can finish later.
 */
export function useLessonPlanBuilder(input: LessonPlanBuilderInput, onSaved?: (plan: LessonPlan) => void) {
  const [result, setResult] = useState<GeneratedLessonPlan | null>(null)
  const [plan, setPlan] = useState<LessonPlan | null>(null)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => controller.current?.abort(), [])

  const persist = async (generated: GeneratedLessonPlan) => {
    if (!plan) {
      const created = await createLessonPlan(input.uid, {
        outline: generated.outline,
        topic: input.topic.trim(),
        level: input.level,
        lessons: generated.lessons,
        status: generated.status,
        sourceText: input.sourceText,
      })
      setPlan(created)
      setResult(generated)
      onSaved?.(created)
      return
    }
    for (const [lessonId, lesson] of Object.entries(generated.lessons)) {
      if (!result?.lessons[lessonId]) await saveLesson(input.uid, plan.id, lessonId, lesson)
    }
    setResult(generated)
    const refreshed = { ...plan, status: generated.status }
    setPlan(refreshed)
    onSaved?.(refreshed)
  }

  const start = async (remaining = false) => {
    const abort = new AbortController()
    controller.current = abort
    setBusy(true)
    setError('')
    setProgress('')
    const onProgress = (done: number, total: number) => setProgress(`Lesson ${done} of ${total}`)
    try {
      const generated = remaining && result
        ? await generateRemainingLessons({
          topic: input.topic,
          level: input.level,
          lessonCount: input.lessonCount,
          sourceText: input.sourceText,
          signal: abort.signal,
          outline: result.outline,
          existing: result.lessons,
          lessonIds: result.failedLessonIds,
          onProgress,
        })
        : await generateLessonPlan({
          topic: input.topic,
          level: input.level,
          lessonCount: input.lessonCount,
          sourceText: input.sourceText,
          signal: abort.signal,
          onProgress,
        })
      await persist(generated)
      setError(describeLessonGeneration(generated))
    } catch (cause) {
      if (isAbortError(cause)) setError('Generation was stopped before any lesson was saved.')
      else if (cause instanceof AiError && cause.reason === 'rate-limit') setError('The AI is rate-limited. Try again later.')
      else setError(cause instanceof Error ? cause.message : 'Could not create this lesson plan.')
    } finally {
      setBusy(false)
      controller.current = null
    }
  }

  const cancel = () => controller.current?.abort()

  return { result, plan, progress, error, busy, start, cancel }
}
