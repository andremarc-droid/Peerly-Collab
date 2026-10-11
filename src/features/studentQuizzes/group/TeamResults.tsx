import { CircleCheck, CircleHelp, CircleX } from 'lucide-react'
import { Alert } from '../../../shared/ui/Alert'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { SectionCard } from '../../../shared/ui/SectionCard'
import type { Team, TeamReveal } from '../../quizzes/types/team'
import { answerText, revealOutcome, scoreLabel } from './teamPlayLogic'

/** After the team submitted: the shared score and, when the quiz allows it, how each question went. */
export function TeamResults({ team, reveals }: { team: Team; reveals: TeamReveal[] }) {
  const anyAnswers = reveals.some(reveal => reveal.result !== null)
  return <div className="grid gap-5">
    <SectionCard title={`${team.name} finished`} description="Everyone on the team has this result.">
      <p className="m-0 text-2xl font-heading" aria-label={`Team score ${scoreLabel(team)}`}>{scoreLabel(team)}</p>
      {team.score === null && <p className="mt-2 mb-0">Your instructor decides when scores are shown. Check back later.</p>}
    </SectionCard>
    {reveals.length > 0 && <SectionCard title="Question by question" description={anyAnswers ? 'Your team’s answers and the correct ones.' : 'Correct answers are not shown for this quiz.'}>
      <ol className="m-0 grid list-none gap-4 p-0" aria-label="Results by question">{reveals.map(reveal => {
        const outcome = revealOutcome(reveal)
        const Icon = !outcome.known ? CircleHelp : outcome.correct ? CircleCheck : CircleX
        return <li key={reveal.index} className="grid gap-1">
          <strong>{reveal.index + 1}. {reveal.question.prompt}</strong>
          <span className="flex flex-wrap items-center gap-2"><Badge className="inline-flex items-center gap-1"><Icon size={13} aria-hidden="true" /> {outcome.label}</Badge>{reveal.result && <span>{reveal.result.pointsAwarded} of {reveal.question.points} points</span>}</span>
          <span><strong>Team answer:</strong> {answerText(reveal.question, reveal.finalAnswer)}{reveal.auto ? ' (chosen automatically when time ran out)' : ''}</span>
          {reveal.result && !reveal.result.correct && <span><strong>Correct answer:</strong> {answerText(reveal.question, reveal.result.correctAnswer)}</span>}
          {reveal.result?.explanation && <span>{reveal.result.explanation}</span>}
        </li>
      })}</ol>
    </SectionCard>}
    {reveals.length === 0 && <Alert tone="info" label="No question details">Details for each question are not available.</Alert>}
    <div><Button to="/student" variant="secondary">Back to practice</Button></div>
  </div>
}
