import { ArrowRight, MoreHorizontal } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../../shared/ui/Button'
import { DropdownMenu } from '../../../shared/ui/DropdownMenu'

/** The three steps of making a quiz, in order: build it, set it up, then preview and publish it. */
export type QuizStep = 'questions' | 'settings' | 'publish'

const STEPS: Array<{ key: QuizStep; label: string }> = [
  { key: 'questions', label: 'Questions' },
  { key: 'settings', label: 'Settings' },
  { key: 'publish', label: 'Preview & publish' },
]

export function quizStepPath(quizId: string, step: QuizStep) {
  return `/instructor/quizzes/${quizId}?tab=${step}`
}

interface QuizWorkflowNavProps {
  quizId: string
  current: QuizStep
  /** Group quizzes get a Teams entry in the More menu. */
  hasTeams?: boolean
  /** Adds one forward button, for steps that have no form of their own to continue from. */
  nextStep?: QuizStep
  nextLabel?: string
  /**
   * Lets a page take over navigation, for example to ask before discarding unsaved work.
   * Without it the steps are ordinary links, which the shared unsaved-changes guard already watches.
   */
  onNavigate?: (path: string) => void
}

/**
 * The one navigation bar for building a quiz: Questions, then Settings, then Preview & publish.
 * Results and Teams live in the More menu so the path forward is always the obvious one.
 */
export function QuizWorkflowNav({ quizId, current, hasTeams = false, nextStep, nextLabel, onNavigate }: QuizWorkflowNavProps) {
  const navigate = useNavigate()
  const go = (path: string) => (onNavigate ? onNavigate(path) : navigate(path))

  return (
    <nav aria-label="Quiz workspace" className="mb-4 flex flex-wrap items-center gap-2">
      {STEPS.map((step, index) => {
        const isCurrent = step.key === current
        const className = `button ${isCurrent ? 'button--secondary font-bold' : 'button--ghost'}`
        const content = (
          <>
            <span aria-hidden="true">{index + 1}</span>
            {step.label}
          </>
        )
        const path = quizStepPath(quizId, step.key)
        return onNavigate
          ? <button key={step.key} type="button" className={className} aria-current={isCurrent ? 'step' : undefined} onClick={() => go(path)}>{content}</button>
          : <Link key={step.key} className={className} to={path} aria-current={isCurrent ? 'step' : undefined}>{content}</Link>
      })}
      <DropdownMenu label="More quiz options" trigger={<><MoreHorizontal size={16} aria-hidden="true" /> More</>}>
        <button type="button" role="menuitem" onClick={() => go(`/instructor/quizzes/${quizId}/results`)}>Results</button>
        {hasTeams && <button type="button" role="menuitem" onClick={() => go(`/instructor/quizzes/${quizId}/teams`)}>Teams</button>}
      </DropdownMenu>
      {nextStep && nextLabel && (
        onNavigate
          ? <Button type="button" onClick={() => go(quizStepPath(quizId, nextStep))}>{nextLabel} <ArrowRight size={16} aria-hidden="true" /></Button>
          : <Button to={quizStepPath(quizId, nextStep)}>{nextLabel} <ArrowRight size={16} aria-hidden="true" /></Button>
      )}
    </nav>
  )
}
