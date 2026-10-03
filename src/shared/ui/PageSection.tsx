import type { HTMLAttributes, ReactNode } from 'react'
import { Layers3 } from 'lucide-react'

interface PageSectionProps extends HTMLAttributes<HTMLElement> {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
}

export function PageSection({ title, description, icon, action, children, className = '', ...props }: PageSectionProps) {
  return <section className={`page-section ${className}`.trim()} {...props}>
    <header className="page-section__header"><span className="page-section__icon" aria-hidden="true">{icon ?? <Layers3 size={20} />}</span><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action && <div className="page-section__action">{action}</div>}</header>
    {children}
  </section>
}
