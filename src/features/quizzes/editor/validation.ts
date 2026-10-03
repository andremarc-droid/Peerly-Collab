import { DomainValidationError, parseQuizSettings } from '../schemas'
import type { QuizMode, QuizSettings } from '../types'

export interface QuizFormValues {
  classId: string
  title: string
  description: string
  tags: string
  mode: QuizMode
  settings: QuizSettings
}

export interface QuizFormErrors {
  classId?: string
  title?: string
  settings?: string
}

export function validateQuizForm(values: QuizFormValues): QuizFormErrors {
  const errors: QuizFormErrors = {}
  if (!values.classId.trim()) errors.classId = 'Choose a class before saving this quiz.'
  if (!values.title.trim()) errors.title = 'Enter a quiz title.'
  else if (values.title.trim().length > 120) errors.title = 'Keep the title under 120 characters.'
  try { parseQuizSettings(values.settings, values.mode) }
  catch (error) { errors.settings = error instanceof DomainValidationError ? error.message : 'Check the quiz settings.' }
  return errors
}
