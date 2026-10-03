import type { HTMLAttributes, ReactNode } from 'react'
import { BookOpenText } from 'lucide-react'

interface SectionCardProps extends HTMLAttributes<HTMLElement> {
  title?: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
}

export function SectionCard({ title, description, icon, action, children, className = '', ...props }: SectionCardProps) {
  return (
    <section className={`section-card ${className}`.trim()} {...props}>
      {(title || description || action) && <header className="section-card__header">
        <div className="section-card__heading">{title && <span className="section-card__icon" aria-hidden="true">{icon ?? <BookOpenText size={20} />}</span>}<div className="section-card__copy">{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div></div>
        {action && <div className="section-card__action">{action}</div>}
      </header>}
      {children}
    </section>
  )
}
