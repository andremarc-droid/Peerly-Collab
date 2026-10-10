import { condenseText } from '../documents/text'
import { MAX_STUDY_FOCUS_CHARS } from './constants'

/** What the learner is studying right now, offered to the tutor as background. Plain text only. */
export interface StudyFocus {
  kind: 'deck' | 'lesson'
  title: string
  text: string
  /** True when the text was sampled because the deck or lesson is longer than the tutor can take. */
  shortened?: boolean
}

interface FocusCard { front: string; back: string }
interface FocusLesson { title: string; objective: string; content: string; keyPoints: string[] }

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g
const MAX_TITLE_CHARS = 120

function cleanTitle(title: string): string {
  return title.replace(CONTROL_CHARS, '').replace(/["\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_CHARS)
}

function fit(kind: StudyFocus['kind'], title: string, raw: string): StudyFocus | null {
  const text = raw.replace(CONTROL_CHARS, '').trim()
  if (!text) return null
  const fitted = condenseText(text, MAX_STUDY_FOCUS_CHARS)
  return { kind, title: cleanTitle(title) || (kind === 'deck' ? 'Flashcard deck' : 'Lesson'), text: fitted.text, shortened: fitted.condensed }
}

/** The cards of a deck as question/answer pairs. Returns null for an empty deck. */
export function buildDeckFocus(title: string, cards: readonly FocusCard[]): StudyFocus | null {
  const lines = cards
    .filter((card) => card.front.trim() && card.back.trim())
    .map((card) => `Q: ${card.front.trim()}\nA: ${card.back.trim()}`)
  return fit('deck', title, lines.join('\n\n'))
}

/** A lesson's objective, text and key points. Returns null when the lesson has no text. */
export function buildLessonFocus(lesson: FocusLesson): StudyFocus | null {
  const points = lesson.keyPoints.map((point) => point.trim()).filter(Boolean)
  const parts = [
    lesson.objective.trim() ? `Objective: ${lesson.objective.trim()}` : '',
    lesson.content.trim(),
    points.length > 0 ? `Key points:\n${points.map((point) => `- ${point}`).join('\n')}` : '',
  ].filter(Boolean)
  return fit('lesson', lesson.title, parts.join('\n\n'))
}

/** Re-applies the limits to a focus that came from somewhere else, so the prompt can never grow past the budget. */
export function clampStudyFocus(focus: StudyFocus | null | undefined): StudyFocus | null {
  if (!focus) return null
  const fitted = fit(focus.kind, focus.title, focus.text)
  return fitted ? { ...fitted, shortened: Boolean(focus.shortened) || fitted.shortened } : null
}
