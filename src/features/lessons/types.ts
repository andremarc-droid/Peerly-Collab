import type { QuizQuestion } from '../studyEngine/quiz'
import type { Flashcard } from '../flashcards/types'

export type LessonLevel = 'beginner' | 'intermediate' | 'advanced'
export type LessonPlanStatus = 'ready' | 'partial'
export type LessonStep = 'read' | 'practice' | 'quiz' | 'done'
export interface LessonPlanRecord { title: string; topic: string; level: LessonLevel; lessonCount: number; order: string[]; createdAt: { toMillis(): number }; updatedAt: { toMillis(): number }; status: LessonPlanStatus }
export interface LessonPlan extends LessonPlanRecord { id: string }
export interface LessonRecord { title: string; objective: string; content: string; keyPoints: string[]; flashcards: Flashcard[]; quiz: QuizQuestion[]; updatedAt: { toMillis(): number } }
export interface Lesson extends LessonRecord { id: string }
export interface LessonCompletion { step: LessonStep; bestScore: number; completedAt: number | null }
export interface LessonProgressRecord { version: 1; lessons: Record<string, LessonCompletion>; lastLessonId: string | null; updatedAt: { toMillis(): number } }
export interface LessonPlanOutline { title: string; lessons: Array<{ id: string; title: string; objective: string }> }
