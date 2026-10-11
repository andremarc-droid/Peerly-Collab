import { CircleCheck, CircleX, Clock3, Crown, Info, Lock, Send, UserCheck, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Alert } from '../../../shared/ui/Alert'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { Input } from '../../../shared/ui/Input'
import { RadioGroup } from '../../../shared/ui/RadioGroup'
import { SectionCard } from '../../../shared/ui/SectionCard'
import type { GroupParticipation } from '../../quizzes/types'
import { advanceTeam, describeTeamError, lockTeamAnswer, submitTeamAnswer, submitTeamAttempt } from '../../quizzes/services/teamService'
import type { Team, TeamAnswer, TeamQuestion, TeamReveal, TeamSession } from '../../quizzes/types/team'
import {
  answerText, answeredCount, currentReveal, emptyAnswer, formatClock, isAnswerComplete, memberProgress, playerRole, promptPieces, revealOutcome,
  secondsLeft, shouldAskServerToAdvance,
} from './teamPlayLogic'

interface TeamPlayProps {
  quizId: string
  team: Team
  session: TeamSession
  reveals: TeamReveal[]
  settings: GroupParticipation
  uid: string
  /** The device clock corrected towards the server clock. Must be a stable function. */
  getNow: () => number
}

/** One question at a time, in step with the server. Every rule (who answers, when time is up) is enforced there; this screen only reflects it. */
export function TeamPlay({ quizId, team, session, reveals, settings, uid, getNow }: TeamPlayProps) {
  const [now, setNow] = useState(getNow)
  const asking = useRef(false)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(getNow()), 500)
    return () => window.clearInterval(timer)
  }, [getNow])

  // The browser never closes a question itself. When its clock says time is up (or a review step stalled) it asks the server, which
  // decides. Asking too early is harmless: the server answers "not yet". One request at a time.
  useEffect(() => {
    if (session.phase === 'finished') return undefined
    const timer = window.setInterval(() => {
      const stalledReview = session.phase === 'review' && session.ready[uid] === true && settings.waitForEveryone && settings.questionTimeSec !== null
      if (!shouldAskServerToAdvance(session, getNow()) && !stalledReview) return
      if (asking.current) return
      asking.current = true
      void advanceTeam(quizId, team.id, session.currentIndex).catch(() => undefined).finally(() => { asking.current = false })
    }, 2000)
    return () => window.clearInterval(timer)
  }, [quizId, team.id, session, settings.waitForEveryone, settings.questionTimeSec, uid, getNow])

  if (session.phase === 'finished' || !session.question) return <FinishPanel quizId={quizId} teamId={team.id} />
  const timeLeft = secondsLeft(session.questionEndsAt, now)
  return <div className="grid gap-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="m-0 text-sm font-semibold uppercase tracking-wider">Question {session.currentIndex + 1} of {session.total}</p><p className="m-0">{team.name} · {session.question.points} {session.question.points === 1 ? 'point' : 'points'}</p></div>
      {session.phase === 'answering' && timeLeft !== null && <Badge className="inline-flex items-center gap-1" role="timer" aria-label={`${formatClock(timeLeft)} left`}><Clock3 size={14} aria-hidden="true" /> {formatClock(timeLeft)} left</Badge>}
    </header>
    {session.phase === 'answering'
      ? <AnsweringPanel key={session.currentIndex} quizId={quizId} team={team} session={session} question={session.question} settings={settings} uid={uid} timeUp={timeLeft === 0} />
      : <ReviewPanel quizId={quizId} team={team} session={session} reveal={currentReveal(reveals, session)} settings={settings} uid={uid} />}
  </div>
}

// ---- answering --------------------------------------------------------------------------------------------------

interface AnsweringProps { quizId: string; team: Team; session: TeamSession; question: TeamQuestion; settings: GroupParticipation; uid: string; timeUp: boolean }

function AnsweringPanel({ quizId, team, session, question, settings, uid, timeUp }: AnsweringProps) {
  const [draft, setDraft] = useState<TeamAnswer>(() => emptyAnswer(question))
  const [busy, setBusy] = useState<'answer' | 'lock' | null>(null)
  const [error, setError] = useState('')
  const role = playerRole({ settings, team, session, uid, timeUp })
  const progress = memberProgress(team, session.answered, uid)
  const done = answeredCount(team, session.answered)
  const complete = isAnswerComplete(question, draft)

  async function send(kind: 'answer' | 'lock') {
    setBusy(kind); setError('')
    try { await (kind === 'answer' ? submitTeamAnswer : lockTeamAnswer)(quizId, team.id, session.currentIndex, draft) }
    catch (reason) { setError(describeTeamError(reason)) }
    finally { setBusy(null) }
  }

  const editable = role.canAnswer || role.canLock
  const isRepresentativeMode = settings.answerMode === 'representative'
  return <div className="grid gap-5">
    {error && <Alert tone="error" label="That did not work">{error}</Alert>}
    <SectionCard title={question.type === 'fill_blank' ? 'Fill in the blanks' : question.prompt} description={isRepresentativeMode ? `${team.memberNames[team.representativeId] || 'Your representative'} answers for the team.` : 'Answer, then any teammate locks in the final team answer.'}>
      <AnswerInput question={question} value={draft} onChange={setDraft} disabled={!editable || busy !== null} />
      {role.reason && <p className="mt-3 mb-0 flex items-center gap-2" role="status"><Info size={16} aria-hidden="true" /> {role.reason}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        {role.canAnswer && <Button type="button" disabled={!complete || busy !== null} onClick={() => void send('answer')}><Send size={16} aria-hidden="true" /> {busy === 'answer' ? 'Sending…' : isRepresentativeMode ? 'Submit team answer' : 'Submit my answer'}</Button>}
        {role.canLock && <Button type="button" disabled={!complete || busy !== null} onClick={() => void send('lock')}><Lock size={16} aria-hidden="true" /> {busy === 'lock' ? 'Locking…' : 'Lock in team answer'}</Button>}
      </div>
      {!isRepresentativeMode && session.answered[uid] === true && !role.canLock && !timeUp && <p className="mt-3 mb-0" role="status">You answered. Waiting for {team.memberIds.length - done} more {team.memberIds.length - done === 1 ? 'teammate' : 'teammates'} before the team can lock in.</p>}
    </SectionCard>

    {!isRepresentativeMode && session.picks && <SectionCard title="Your teammates’ answers" description="Everyone has answered. Pick one as the team answer or type your own, then lock it in.">
      <ul className="m-0 grid list-none gap-2 p-0">{team.memberIds.map(id => {
        const pick = session.picks?.[id]
        return pick === undefined ? null : <li key={id} className="flex flex-wrap items-center justify-between gap-2"><span><strong>{team.memberNames[id] || 'Student'}</strong>: {answerText(question, pick)}</span>
          {role.canLock && <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => setDraft(pick)}>Use this answer</Button>}</li>
      })}</ul>
    </SectionCard>}

    <SectionCard title="Team progress" description={isRepresentativeMode ? 'You can see who is answering. Choices stay hidden until the question closes.' : `${done} of ${team.memberIds.length} answered. Choices stay hidden until everyone answers.`}>
      <ul className="m-0 grid list-none gap-2 p-0" aria-label="Who has answered">{progress.map(member => <li key={member.uid} className="flex flex-wrap items-center gap-2">
        {member.answered ? <UserCheck size={16} aria-hidden="true" /> : <UserRound size={16} aria-hidden="true" />}
        <strong>{member.name}{member.isMe ? ' (you)' : ''}</strong>
        {member.isRepresentative && <Badge className="inline-flex items-center gap-1"><Crown size={12} aria-hidden="true" /> Representative</Badge>}
        <span>{member.answered ? 'Answered' : 'Waiting'}</span>
      </li>)}</ul>
    </SectionCard>
  </div>
}

function AnswerInput({ question, value, onChange, disabled }: { question: TeamQuestion; value: TeamAnswer; onChange: (value: TeamAnswer) => void; disabled: boolean }) {
  if (question.type === 'multiple_choice' || question.type === 'true_false') {
    return <RadioGroup label={question.prompt} name={`answer-${question.id}`} value={typeof value === 'string' ? value : ''} onChange={onChange} disabled={disabled} options={question.options.map(option => ({ value: option.id, label: option.text }))} />
  }
  if (question.type === 'fill_blank') {
    const pieces = promptPieces(question.prompt)
    const answers = Array.isArray(value) ? value : []
    return <div className="grid gap-3">
      <p className="m-0" aria-hidden="true">{pieces.map((piece, index) => <span key={index}>{piece}{index < pieces.length - 1 && <strong>[{index + 1}]</strong>}</span>)}</p>
      {pieces.slice(0, -1).map((_, index) => <Input key={index} label={`Blank ${index + 1}`} name={`blank-${index}`} value={answers[index] ?? ''} disabled={disabled} maxLength={300} autoComplete="off"
        onChange={event => onChange(answers.map((item, at) => (at === index ? event.target.value : item)))} />)}
    </div>
  }
  return <Input label="Your answer" name="answer" value={typeof value === 'string' ? value : ''} disabled={disabled} maxLength={500} autoComplete="off" onChange={event => onChange(event.target.value)} />
}

// ---- review -----------------------------------------------------------------------------------------------------

interface ReviewProps { quizId: string; team: Team; session: TeamSession; reveal: TeamReveal | null; settings: GroupParticipation; uid: string }

function ReviewPanel({ quizId, team, session, reveal, settings, uid }: ReviewProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const last = session.currentIndex + 1 >= session.total
  const readyCount = team.memberIds.filter(id => session.ready[id] === true).length
  const iAmReady = session.ready[uid] === true

  async function next() {
    setBusy(true); setError('')
    try { await advanceTeam(quizId, team.id, session.currentIndex) }
    catch (reason) { setError(describeTeamError(reason)) }
    finally { setBusy(false) }
  }

  if (!reveal) return <p className="m-0" role="status">Loading the result of this question…</p>
  const outcome = revealOutcome(reveal)
  const OutcomeIcon = outcome.correct ? CircleCheck : CircleX
  return <div className="grid gap-5">
    {error && <Alert tone="error" label="That did not work">{error}</Alert>}
    <SectionCard title={reveal.question.prompt} description={reveal.auto ? 'Time ran out, so the team’s answer was chosen automatically.' : `Locked in by ${reveal.lockedBy ? (team.memberNames[reveal.lockedBy] || 'a teammate') : 'the team'}.`}>
      <p className="m-0 flex flex-wrap items-center gap-2"><strong>Team answer:</strong> {answerText(reveal.question, reveal.finalAnswer)}</p>
      <p className="mt-3 mb-0 flex items-center gap-2" role="status">{outcome.known && <OutcomeIcon size={18} aria-hidden="true" />}<strong>{outcome.label}</strong>{reveal.result && <span>· {reveal.result.pointsAwarded} of {reveal.question.points} points</span>}</p>
      {reveal.result && !reveal.result.correct && <p className="mt-3 mb-0"><strong>Correct answer:</strong> {answerText(reveal.question, reveal.result.correctAnswer)}</p>}
      {reveal.result?.explanation && <p className="mt-3 mb-0">{reveal.result.explanation}</p>}
      {settings.answerMode === 'everyone' && Object.keys(reveal.picks).length > 0 && <div className="mt-4">
        <h3 className="m-0 text-base">What everyone answered</h3>
        <ul className="m-0 mt-2 grid list-none gap-1 p-0">{team.memberIds.filter(id => reveal.picks[id] !== undefined).map(id => <li key={id}><strong>{team.memberNames[id] || 'Student'}</strong>: {answerText(reveal.question, reveal.picks[id] ?? null)}</li>)}</ul>
      </div>}
    </SectionCard>
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" disabled={busy || (iAmReady && settings.waitForEveryone)} onClick={() => void next()}>{busy ? 'One moment…' : iAmReady && settings.waitForEveryone ? 'Ready' : last ? 'Finish quiz' : 'Next question'}</Button>
      {settings.waitForEveryone && <span role="status">{iAmReady ? `Waiting for teammates: ${readyCount} of ${team.memberIds.length} ready.` : `${readyCount} of ${team.memberIds.length} ready.`}</span>}
    </div>
  </div>
}

// ---- finish -----------------------------------------------------------------------------------------------------

function FinishPanel({ quizId, teamId }: { quizId: string; teamId: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit() {
    setBusy(true); setError('')
    try { await submitTeamAttempt(quizId, teamId) }
    catch (reason) { setError(describeTeamError(reason)) }
    finally { setBusy(false) }
  }
  return <SectionCard title="All questions answered" description="Submit to record the team’s score. Everyone on the team gets the same result.">
    {error && <Alert tone="error" label="Could not submit">{error}</Alert>}
    <div className="mt-4"><Button type="button" disabled={busy} onClick={() => void submit()}><Send size={16} aria-hidden="true" /> {busy ? 'Submitting…' : 'Submit for the team'}</Button></div>
  </SectionCard>
}
