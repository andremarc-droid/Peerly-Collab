import type { ReactNode } from 'react'

interface DataCardProps {
  title: string
  meta?: string
  badge?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}

export function DataCard({ title, meta, badge, actions, children }: DataCardProps) {
  return <article className="data-card"><div className="data-card__main"><div className="data-card__title-row"><h3>{title}</h3>{badge}</div>{meta && <p className="data-card__meta">{meta}</p>}{children && <div className="data-card__content">{children}</div>}</div>{actions && <div className="data-card__actions">{actions}</div>}</article>
}
