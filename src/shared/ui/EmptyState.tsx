import { useId, type ReactNode } from 'react'
import { BookOpenCheck } from 'lucide-react'

interface EmptyStateProps {
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  const titleId = useId()

  return (
    <section className="empty-state" aria-labelledby={titleId}>
      <div className="empty-state__art" aria-hidden="true">
        <span className="empty-state__stripe" />
        <span className="empty-state__card empty-state__card--back" />
        <span className="empty-state__card empty-state__card--middle" />
        <span className="empty-state__card empty-state__card--front"><BookOpenCheck size={30} /></span>
      </div>
      <span className="empty-state__eyebrow">YOUR NEXT STEP STARTS HERE</span>
      <h2 id={titleId}>{title}</h2>
      <p>{description}</p>
      {action && <div className="empty-state__action">{action}</div>}
    </section>
  )
}
