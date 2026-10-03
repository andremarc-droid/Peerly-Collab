import { DomainValidationError, parseQuizSettings } from '../schemas'
import type { QuizMode, QuizSettings } from '../types'

export interface QuizFormValues {
  title: string
  description: string
  tags: string
  mode: QuizMode
  settings: QuizSettings
}

export interface QuizFormErrors {
  title?: string
  settings?: string
}

export function validateQuizForm(values: QuizFormValues): QuizFormErrors {
  const errors: QuizFormErrors = {}
  if (!values.title.trim()) errors.title = 'Enter a quiz title.'
  else if (values.title.trim().length > 120) errors.title = 'Keep the title under 120 characters.'
  try { parseQuizSettings(values.settings, values.mode) }
  catch (error) { errors.settings = error instanceof DomainValidationError ? error.message : 'Check the quiz settings.' }
  return errors
}
