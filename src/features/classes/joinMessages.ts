import type { JoinOutcome } from './types'

type JoinOutcomeName = JoinOutcome['outcome']
type FeedbackTone = 'success' | 'error' | 'warning'

export interface JoinFeedback {
  label: string
  message: string
  tone: FeedbackTone
}

const messages: Record<JoinOutcomeName, JoinFeedback> = {
  joined: { label: 'You’re in', message: 'You joined this class. Its published quizzes are ready to explore.', tone: 'success' },
  pending_approval: { label: 'Request sent', message: 'Your request is waiting for approval from the instructor.', tone: 'warning' },
  request_already_pending: { label: 'Waiting for approval', message: 'You already have a request waiting for this instructor.', tone: 'warning' },
  already_member: { label: 'Already a member', message: 'You already belong to this class.', tone: 'success' },
  blocked: { label: 'Contact your instructor', message: 'You cannot rejoin this class while your enrollment is blocked.', tone: 'error' },
  joining_paused: { label: 'Joining is paused', message: 'The instructor has paused new class sign-ups. Try again later.', tone: 'warning' },
  class_archived: { label: 'Class archived', message: 'This class is archived and is not accepting students.', tone: 'warning' },
  instructor_cannot_join: { label: 'Use a student account', message: 'Use a student account to join a class.', tone: 'error' },
  not_found: { label: 'Code not found', message: 'We couldn’t find a class with that code. Check it with your instructor and try again.', tone: 'error' },
}

export function joinOutcomeMessage(outcome: JoinOutcomeName): JoinFeedback {
  return messages[outcome]
}

export function joinLookupErrorMessage(error: unknown): JoinFeedback {
  if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'JoinLookupCooldownError') {
    return { label: 'Please wait before trying again', message: 'Too many unsuccessful code lookups. Please wait a few minutes before trying again.', tone: 'warning' }
  }
  if (typeof error === 'object' && error !== null && 'code' in error && ['unavailable', 'network-request-failed'].includes(String(error.code))) {
    return { label: 'Connection problem', message: 'We couldn’t reach the class service. Check your connection and try again.', tone: 'error' }
  }
  return { label: 'Class lookup failed', message: 'We couldn’t look up this class. Please try again.', tone: 'error' }
}
