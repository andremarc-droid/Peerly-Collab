import type { HTMLAttributes, ReactNode } from 'react'

interface SectionCardProps extends HTMLAttributes<HTMLElement> {
  title?: string
  description?: string
  children: ReactNode
}

export function SectionCard({ title, description, children, className = '', ...props }: SectionCardProps) {
  return (
    <section className={`section-card ${className}`.trim()} {...props}>
      {(title || description) && <header className="section-card__header">
        {title && <h2>{title}</h2>}
        {description && <p>{description}</p>}
      </header>}
      {children}
    </section>
  )
}
