import { ClipboardList, Layers, ListChecks, Shapes, type LucideIcon } from 'lucide-react'
import { Badge } from '../../shared/ui/Badge'
import { quizModeLabel } from './types'
import './quizTypeBadge.css'

export type ActivityKindValue = Parameters<typeof quizModeLabel>[0] | 'assignment'

const KINDS: Record<string, { icon: LucideIcon; className: string; label?: string }> = {
  quiz: { icon: ListChecks, className: 'badge--kind-quiz' },
  flashcards: { icon: Layers, className: 'badge--kind-flashcards' },
  canvas: { icon: Shapes, className: 'badge--kind-canvas' },
  assignment: { icon: ClipboardList, className: 'badge--kind-assignment', label: 'Assignment' },
}

/**
 * The activity type (Quiz, Flashcards, Canvas or Assignment) as a colored chip with an icon.
 * Color and icon together mean the type is never told apart by color alone.
 */
export function QuizTypeBadge({ mode }: { mode: ActivityKindValue }) {
  const kind = KINDS[mode]
  const label = kind?.label ?? (mode !== 'assignment' ? quizModeLabel(mode) : 'Assignment')
  if (!kind) return <Badge>{label}</Badge>
  const Icon = kind.icon
  return (
    <Badge className={`badge--kind ${kind.className}`}>
      <Icon size={13} aria-hidden="true" />
      {label}
    </Badge>
  )
}

/**
 * Convenience badge for assignments with consistent styling and the ClipboardList icon.
 */
export function AssignmentTypeBadge() {
  return <QuizTypeBadge mode="assignment" />
}

