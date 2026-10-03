import type { QuestionType } from '../types'

export interface ParsedTextQuestion {
  type: 'multiple_choice' | 'identification'
  prompt: string
  options: { text: string; correct: boolean }[]
  answer: string
  error?: string
}

/** Parses blank-line-separated questions with a), b), *c) option syntax. */
export function parseQuestionsFromText(input: string): ParsedTextQuestion[] {
  return input.trim() ? input.trim().split(/\n\s*\n+/).map((block) => {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    const prompt = (lines.shift() ?? '').replace(/^\d+[.)]\s*/, '')
    const options = lines.filter((line) => /^[*]?\s*[a-z][).]\s*/i.test(line)).map((line) => ({
      text: line.replace(/^\*?\s*[a-z][).]\s*/i, '').trim(), correct: /^\*\s*[a-z][).]/i.test(line),
    }))
    if (options.length) {
      const error = !prompt ? 'Add a question prompt.' : options.length < 2 ? 'Add at least two options.' : options.some((item) => !item.text) ? 'Fill in every option.' : options.filter((item) => item.correct).length !== 1 ? 'Mark exactly one correct option with *.' : undefined
      return { type: 'multiple_choice' as const, prompt, options, answer: '', ...(error ? { error } : {}) }
    }
    const answerLine = lines.find((line) => /^answer\s*:/i.test(line))
    const answer = answerLine?.replace(/^answer\s*:/i, '').trim() ?? ''
    return { type: 'identification' as const, prompt, options: [], answer, ...(!prompt ? { error: 'Add a question prompt.' } : !answer ? { error: 'Add an Answer: line.' } : {}) }
  }) : []
}

export type AuthoringPreset = 'practice' | 'graded' | 'flashcards' | 'custom'
export function settingsForPreset(preset: Exclude<AuthoringPreset, 'custom'>, current: import('../types').QuizSettings): import('../types').QuizSettings {
  if (preset === 'flashcards') return { ...current, answerReveal: 'never', scoreVisibility: 'hidden', scoresReleased: false, attemptsAllowed: null, timeLimitMinutes: null, shuffleQuestions: false, shuffleOptions: false }
  if (preset === 'graded') return { ...current, answerReveal: 'after_submit', scoreVisibility: 'after_release', scoresReleased: false, attemptsAllowed: 1, shuffleQuestions: true, shuffleOptions: true }
  return { ...current, answerReveal: 'after_each', scoreVisibility: 'immediate', scoresReleased: false, attemptsAllowed: null, timeLimitMinutes: null, shuffleQuestions: false, shuffleOptions: false }
}

export function publishChecklist(input: { title: string; questionCount: number; classId?: string | null }) {
  return { title: Boolean(input.title.trim()), questions: input.questionCount > 0, classAssigned: Boolean(input.classId), ready: Boolean(input.title.trim()) && input.questionCount > 0 && Boolean(input.classId) }
}

export function questionTypeFromText(question: ParsedTextQuestion): QuestionType { return question.type }
