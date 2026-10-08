import { Layers, ListChecks, Shapes, type LucideIcon } from 'lucide-react'
import { Badge } from '../../shared/ui/Badge'
import { quizModeLabel } from './types'
import './quizTypeBadge.css'

type QuizModeValue = Parameters<typeof quizModeLabel>[0]

const KINDS: Record<string, { icon: LucideIcon; className: string }> = {
  quiz: { icon: ListChecks, className: 'badge--kind-quiz' },
  flashcards: { icon: Layers, className: 'badge--kind-flashcards' },
  canvas: { icon: Shapes, className: 'badge--kind-canvas' },
}

/**
 * The activity type (Quiz, Flashcards or Canvas) as a colored chip with an icon.
 * Color and icon together mean the type is never told apart by color alone.
 */
export function QuizTypeBadge({ mode }: { mode: QuizModeValue }) {
  const label = quizModeLabel(mode)
  const kind = KINDS[mode]
  if (!kind) return <Badge>{label}</Badge>
  const Icon = kind.icon
  return (
    <Badge className={`badge--kind ${kind.className}`}>
      <Icon size={13} aria-hidden="true" />
      {label}
    </Badge>
  )
}
