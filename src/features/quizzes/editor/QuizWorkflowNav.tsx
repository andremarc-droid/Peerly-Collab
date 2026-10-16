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
    <nav aria-label="Quiz workspace" className="quiz-workflow-nav mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="quiz-workflow-nav__steps flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
        {STEPS.map((step, index) => {
          const isCurrent = step.key === current
          const className = `quiz-workflow-nav__step ${isCurrent ? 'is-active' : ''}`
          const content = (
            <>
              <span className="quiz-workflow-nav__step-number" aria-hidden="true">{index + 1}</span>
              <span className="quiz-workflow-nav__step-label">{step.label}</span>
            </>
          )
          const path = quizStepPath(quizId, step.key)
          return onNavigate
            ? <button key={step.key} type="button" className={className} aria-current={isCurrent ? 'step' : undefined} onClick={() => go(path)}>{content}</button>
            : <Link key={step.key} className={className} to={path} aria-current={isCurrent ? 'step' : undefined}>{content}</Link>
        })}
      </div>
      <div className="quiz-workflow-nav__actions flex items-center gap-2">
        <DropdownMenu
          label="More quiz options"
          className="quiz-workflow-nav__dropdown"
          trigger={<><MoreHorizontal size={16} aria-hidden="true" /> More</>}
        >
          <button type="button" role="menuitem" onClick={() => go(`/instructor/quizzes/${quizId}/results`)}>Results</button>
          {hasTeams && <button type="button" role="menuitem" onClick={() => go(`/instructor/quizzes/${quizId}/teams`)}>Teams</button>}
        </DropdownMenu>
        {nextStep && nextLabel && (
          onNavigate
            ? <Button type="button" className="quiz-workflow-nav__next" onClick={() => go(quizStepPath(quizId, nextStep))}>{nextLabel} <ArrowRight size={16} aria-hidden="true" /></Button>
            : <Button to={quizStepPath(quizId, nextStep)} className="quiz-workflow-nav__next">{nextLabel} <ArrowRight size={16} aria-hidden="true" /></Button>
        )}
      </div>
    </nav>
  )
}
