import { DomainValidationError, parseQuizSettings } from '../schemas'
import type { QuizMode, QuizSettings } from '../types'

export interface QuizFormValues {
  classId: string
  title: string
  description: string
  tags: string
  mode: QuizMode
  boardKind?: 'prebuilt' | 'blank'
  settings: QuizSettings
}

export interface QuizFormErrors {
  classId?: string
  title?: string
  description?: string
  tags?: string
  settings?: string
}

export function validateQuizForm(values: QuizFormValues): QuizFormErrors {
  const errors: QuizFormErrors = {}
  if (!values.classId.trim()) errors.classId = 'Choose a class before saving this quiz.'
  if (!values.title.trim()) errors.title = 'Enter a quiz title.'
  else if (values.title.trim().length > 120) errors.title = 'Keep the title under 120 characters.'
  if (values.description.trim().length > 2000) errors.description = 'Keep the description under 2000 characters.'
  const tagsList = values.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
  if (tagsList.length > 20) errors.tags = 'Use at most 20 tags.'
  try { parseQuizSettings(values.settings, values.mode) }
  catch (error) { errors.settings = error instanceof DomainValidationError ? error.message : 'Check the quiz settings.' }
  return errors
}
