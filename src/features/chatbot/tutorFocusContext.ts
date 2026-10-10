import { createContext, useContext } from 'react'
import type { StudyFocus } from './studyFocus'

export interface TutorFocusValue {
  /** The deck or lesson the tutor was opened from, or null. */
  focus: StudyFocus | null
  /** Goes up by one each time someone asks the tutor about something, so the dock and chat can react. */
  openRequest: number
  /** Opens the tutor on a fresh chat about this deck or lesson. */
  askTutor: (focus: StudyFocus) => void
  clearFocus: () => void
}

export const TutorFocusContext = createContext<TutorFocusValue | null>(null)

/** Null outside the Learning hub, so screens can offer "Ask the tutor" only where it can work. */
export function useTutorFocus(): TutorFocusValue | null {
  return useContext(TutorFocusContext)
}
