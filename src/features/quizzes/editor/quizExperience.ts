import type { BoardKind, QuizMode, QuizSettings } from '../types'
import { describeGroupExperience } from './groupSettingsLogic'
import { describeWindow, effectiveTimeLimitSeconds, formatDuration } from '../quizTiming'

interface ExperienceInput {
  mode: QuizMode
  boardKind?: BoardKind
  title: string
  settings: QuizSettings
}

/**
 * One plain-language paragraph describing what students will go through.
 * Shown on the Settings step and again on the final Preview & publish step so the instructor
 * confirms the experience right before it goes live.
 */
export function describeQuizExperience({ mode, boardKind, title, settings }: ExperienceInput): string {
  const participation = settings.participation
  const revealSentence = settings.answerReveal === 'after_each'
    ? 'Explanations appear after each question.'
    : settings.answerReveal === 'after_submit'
      ? 'Explanations appear after the team submits.'
      : 'Answers stay hidden.'

  if (mode === 'flashcards') return `Students will review ${title.trim() || 'this set'} as flashcards and self-rate their recall.`
  if (mode === 'canvas') {
    if (participation.type === 'group') {
      const formation = participation.teamFormation === 'assigned' ? 'You build the teams from your class roster' : 'Students form their own teams with a team code'
      return boardKind === 'blank'
        ? `${formation}, in teams of up to ${participation.groupSize}. One representative builds the board while teammates watch. You will review and grade their submissions.`
        : `${formation}, in teams of up to ${participation.groupSize}. One representative connects cards on the canvas board while teammates watch. Each team gets one shared score.`
    }
    return boardKind === 'blank'
      ? 'Students will create their own concept board from a blank canvas. You will review and grade their submissions.'
      : 'Students will connect cards on the canvas board individually.'
  }
  if (participation.type === 'group') return `${describeGroupExperience(participation)} ${revealSentence}`

  const limitSeconds = effectiveTimeLimitSeconds(settings)
  const time = limitSeconds !== null ? `, with ${formatDuration(limitSeconds)} for each question` : ''
  const attempts = settings.attemptsAllowed
    ? ` and ${settings.attemptsAllowed} ${settings.attemptsAllowed === 1 ? 'attempt' : 'attempts'}`
    : ' with unlimited attempts'
  const reveal = settings.answerReveal === 'after_each'
    ? ', seeing explanations after each answer.'
    : settings.answerReveal === 'after_submit'
      ? ', reviewing explanations after they submit.'
      : ', with answers hidden.'
  const windowText = describeWindow(settings)
  return `Students will answer ${title.trim() || 'this quiz'} individually${time}${attempts}${reveal}${windowText ? ` ${windowText}` : ''}`
}
