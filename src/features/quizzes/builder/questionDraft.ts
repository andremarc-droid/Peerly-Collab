import type { AnswerKey, QuizMode, QuizQuestion, QuestionType } from '../types'

export interface QuestionDraft {
  type: QuestionType
  prompt: string
  points: string
  explanation: string
  caseSensitive: boolean
  options: { id: string; text: string; correct: boolean }[]
  acceptedAnswers: string
  blankAnswers: string[]
  back: string
}

export type QuestionErrors = Partial<Record<'type' | 'prompt' | 'points' | 'options' | 'acceptedAnswers' | 'blanks' | 'back', string>>

export function detectBlankCount(prompt: string): number {
  return prompt.match(/___/g)?.length ?? 0
}

export function createQuestionDraft(type: QuestionType, order = 0): QuestionDraft {
  const options = type === 'true_false'
    ? [{ id: `true-${order}`, text: 'True', correct: false }, { id: `false-${order}`, text: 'False', correct: false }]
    : type === 'multiple_choice'
      ? [{ id: `option-a-${order}`, text: '', correct: false }, { id: `option-b-${order}`, text: '', correct: false }]
      : []
  return { type, prompt: '', points: '1', explanation: '', caseSensitive: false, options, acceptedAnswers: '', blankAnswers: [], back: '' }
}

export function validateQuestionDraft(draft: QuestionDraft, mode: QuizMode): QuestionErrors {
  const errors: QuestionErrors = {}
  if ((mode === 'flashcards') !== (draft.type === 'flashcard')) errors.type = 'Question type must match the quiz format.'
  if (!draft.prompt.trim()) errors.prompt = 'Enter a prompt.'
  else if (draft.prompt.trim().length > 2000) errors.prompt = 'Keep prompt under 2000 characters.'
  if (!/^\d+$/.test(draft.points) || Number(draft.points) < 1) errors.points = 'Points must be a whole number of at least 1.'
  if (draft.type === 'multiple_choice' || draft.type === 'true_false') {
    if (draft.options.length < 2 || draft.options.length > 6 || draft.options.some((option) => !option.text.trim())) errors.options = 'Add 2–6 non-empty options.'
    else if (draft.options.some((option) => option.text.trim().length > 500)) errors.options = 'Keep option text under 500 characters.'
    else if (draft.options.filter((option) => option.correct).length !== 1) errors.options = 'Mark the correct option.'
  }
  if (draft.type === 'identification' && !draft.acceptedAnswers.split('\n').some((answer) => answer.trim())) errors.acceptedAnswers = 'Add at least one accepted answer.'
  if (draft.type === 'fill_blank') {
    const blanks = detectBlankCount(draft.prompt)
    if (blanks === 0) errors.blanks = 'Add at least one blank using ___ in the prompt.'
    else if (draft.blankAnswers.length !== blanks || draft.blankAnswers.some((answer) => !answer.split('\n').some((item) => item.trim()))) errors.blanks = 'Add at least one accepted answer for each blank.'
  }
  if (draft.type === 'flashcard' && !draft.back.trim()) errors.back = 'Enter the back of the flashcard.'
  return errors
}

export function toQuestionPair(draft: QuestionDraft, order: number): { question: QuizQuestion; answerKey: AnswerKey } {
  const explanation = draft.explanation.trim()
  const caseSensitive = draft.caseSensitive
  const questionBase = { order, prompt: draft.prompt.trim(), points: Number(draft.points) }
  if (draft.type === 'multiple_choice' || draft.type === 'true_false') {
    const question = { ...questionBase, type: draft.type, options: draft.options.map(({ id, text }) => ({ id, text: text.trim() })) }
    const answerKey = { type: 'choice' as const, correctOptionId: draft.options.find(({ correct }) => correct)?.id ?? '', explanation, caseSensitive }
    return { question, answerKey }
  }
  if (draft.type === 'identification') {
    return { question: { ...questionBase, type: draft.type }, answerKey: { type: draft.type, acceptedAnswers: draft.acceptedAnswers.split('\n').map((answer) => answer.trim()).filter(Boolean), explanation, caseSensitive } }
  }
  if (draft.type === 'fill_blank') {
    return { question: { ...questionBase, type: draft.type }, answerKey: { type: draft.type, blanks: draft.blankAnswers.map((answer) => answer.split('\n').map((item) => item.trim()).filter(Boolean)), explanation, caseSensitive } }
  }
  return { question: { ...questionBase, type: 'flashcard' }, answerKey: { type: 'flashcard', back: draft.back.trim(), explanation, caseSensitive: false } }
}

export function draftFromPair(question: QuizQuestion, answerKey: AnswerKey): QuestionDraft {
  return {
    type: question.type,
    prompt: question.prompt,
    points: String(question.points),
    explanation: answerKey.explanation,
    caseSensitive: answerKey.caseSensitive,
    options: question.type === 'multiple_choice' || question.type === 'true_false'
      ? question.options.map((option) => ({ ...option, correct: answerKey.type === 'choice' && answerKey.correctOptionId === option.id }))
      : [],
    acceptedAnswers: answerKey.type === 'identification' ? answerKey.acceptedAnswers.join('\n') : '',
    blankAnswers: answerKey.type === 'fill_blank' ? answerKey.blanks.map((answers) => answers.join('\n')) : [],
    back: answerKey.type === 'flashcard' ? answerKey.back : '',
  }
}

export function moveQuestion<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return items
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
