import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { clampStudyFocus, type StudyFocus } from './studyFocus'
import { TutorFocusContext, type TutorFocusValue } from './tutorFocusContext'

/** Holds what the learner is studying so any deck or lesson screen can hand it to the tutor. Kept in memory only. */
export function TutorFocusProvider({ children }: { children: ReactNode }) {
  const [focus, setFocus] = useState<StudyFocus | null>(null)
  const [openRequest, setOpenRequest] = useState(0)

  const askTutor = useCallback((next: StudyFocus) => {
    const safe = clampStudyFocus(next)
    if (!safe) return
    setFocus(safe)
    setOpenRequest((count) => count + 1)
  }, [])
  const clearFocus = useCallback(() => setFocus(null), [])

  const value = useMemo<TutorFocusValue>(
    () => ({ focus, openRequest, askTutor, clearFocus }),
    [focus, openRequest, askTutor, clearFocus],
  )
  return <TutorFocusContext.Provider value={value}>{children}</TutorFocusContext.Provider>
}
