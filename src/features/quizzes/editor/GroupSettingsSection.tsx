import { useState } from 'react'
import { Input } from '../../../shared/ui/Input'
import { RadioGroup } from '../../../shared/ui/RadioGroup'
import { SectionCard } from '../../../shared/ui/SectionCard'
import type { AnswerMode, GroupParticipation, Participation, QuizMode, TeamFormation } from '../types'
import { GROUP_LIMITS } from '../types/group'
import { DEFAULT_GROUP_TIMER_SEC, defaultGroupParticipation, groupSettingsErrors, waitHint } from './groupSettingsLogic'

interface Props {
  mode: QuizMode
  participation: Participation
  disabled?: boolean
  onChange: (next: Participation) => void
}

const answerModeOptions: Array<{ value: AnswerMode; label: string; hint: string }> = [
  { value: 'representative', label: 'One representative answers', hint: 'One teammate submits the team’s answer for each question. The others can watch.' },
  { value: 'everyone', label: 'Everyone answers, then one locks it in', hint: 'Each teammate picks an answer, then any one of them locks in the team’s final answer. It can match a teammate’s pick or differ.' },
]
const formationOptions: Array<{ value: TeamFormation; label: string; hint: string }> = [
  { value: 'assigned', label: 'I build the teams', hint: 'You place students from your class roster into teams.' },
  { value: 'self', label: 'Students form their own teams', hint: 'A student creates a team and shares a code. They can also start from one of their study groups.' },
]

/** Turns what was typed into a number. An empty or unreadable box becomes NaN so the field shows an error instead of a silent default. */
const toNumber = (text: string) => (text.trim() === '' ? Number.NaN : Number(text))

export function GroupSettingsSection({ mode, participation, disabled, onChange }: Props) {
  if (mode === 'flashcards') {
    return (
      <SectionCard title="Participation" description="Choose whether learners answer alone or together.">
        <p className="field__hint">Flashcard sets are always completed individually.</p>
      </SectionCard>
    )
  }
  const isGroup = participation.type === 'group'
  return (
    <SectionCard title="Participation" description="Choose whether learners answer alone or together.">
      <RadioGroup
        label="How students participate"
        name="participation"
        disabled={disabled}
        value={participation.type}
        options={[
          { value: 'individual', label: 'Individual', hint: 'Each student completes their own attempt.' },
          { value: 'group', label: 'Group of 2 or more', hint: 'Teams answer together and share one score.' },
        ]}
        onChange={(value) => {
          if (value === 'group') {
            const base = participation.type === 'group' ? participation : defaultGroupParticipation()
            onChange(mode === 'canvas' ? { ...base, answerMode: 'representative', waitForEveryone: false, questionTimeSec: null } : base)
          } else {
            onChange({ type: 'individual' })
          }
        }}
      />
      {isGroup && <GroupFields mode={mode} participation={participation} disabled={disabled} onChange={onChange} />}
    </SectionCard>
  )
}

function GroupFields({ mode, participation, disabled, onChange }: { mode: QuizMode; participation: GroupParticipation; disabled?: boolean; onChange: (next: Participation) => void }) {
  const [sizeText, setSizeText] = useState(String(participation.groupSize))
  const [timerText, setTimerText] = useState(String(participation.questionTimeSec ?? DEFAULT_GROUP_TIMER_SEC))
  const errors = groupSettingsErrors(participation)
  const update = (patch: Partial<GroupParticipation>) => onChange({ ...participation, ...patch })
  const timerOn = participation.questionTimeSec !== null
  const isCanvas = mode === 'canvas'

  return (
    <div className="quiz-editor__fields">
      <Input
        label="Largest team size"
        name="group-size"
        type="number"
        inputMode="numeric"
        min={GROUP_LIMITS.minTeamSize}
        max={GROUP_LIMITS.maxTeamSize}
        disabled={disabled}
        value={sizeText}
        onChange={(event) => { setSizeText(event.target.value); update({ groupSize: toNumber(event.target.value) }) }}
        error={errors.groupSize}
        hint={`Teams can have ${GROUP_LIMITS.minTeamSize} to ${GROUP_LIMITS.maxTeamSize} members. A team needs at least 2 members to start.`}
      />
      {!isCanvas && (
        <RadioGroup label="How teams answer" name="group-answer-mode" disabled={disabled} value={participation.answerMode} options={answerModeOptions} onChange={(value) => update({ answerMode: value as AnswerMode })} />
      )}
      <RadioGroup label="How teams are formed" name="group-team-formation" disabled={disabled} value={participation.teamFormation} options={formationOptions} onChange={(value) => update({ teamFormation: value as TeamFormation })} />
      {!isCanvas && (
        <div className="quiz-editor__settings-grid">
          <label className="choice-control">
            <input type="checkbox" disabled={disabled} checked={participation.waitForEveryone} onChange={(event) => update({ waitForEveryone: event.target.checked })} />
            <span className="choice-control__mark" aria-hidden="true" />
            <span className="choice-control__copy"><strong>Wait for everyone</strong><small>{waitHint(participation)}</small></span>
          </label>
          <label className="choice-control">
            <input
              type="checkbox"
              disabled={disabled}
              checked={timerOn}
              onChange={(event) => {
                if (event.target.checked) { setTimerText(String(DEFAULT_GROUP_TIMER_SEC)); update({ questionTimeSec: DEFAULT_GROUP_TIMER_SEC }) }
                else update({ questionTimeSec: null })
              }}
            />
            <span className="choice-control__mark" aria-hidden="true" />
            <span className="choice-control__copy"><strong>Set a timer for each question</strong><small>The question closes when time runs out, even if someone has not answered. The server keeps the clock.</small></span>
          </label>
          {timerOn && (
            <Input
              label="Seconds per question"
              name="group-question-time"
              type="number"
              inputMode="numeric"
              min={GROUP_LIMITS.minQuestionTimeSec}
              max={GROUP_LIMITS.maxQuestionTimeSec}
              disabled={disabled}
              value={timerText}
              onChange={(event) => { setTimerText(event.target.value); update({ questionTimeSec: toNumber(event.target.value) }) }}
              error={errors.questionTimeSec}
            />
          )}
        </div>
      )}
      <p className="field__hint">
        {isCanvas
          ? 'One representative edits the board while teammates watch. A team’s attempt counts against every member’s attempts allowed. Flashcard sets stay individual.'
          : 'With no timer and no waiting, each team moves at its own pace. A team’s attempt counts against every member’s attempts allowed. Flashcard sets stay individual.'}
      </p>
    </div>
  )
}
