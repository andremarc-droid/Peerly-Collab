import type { ReactNode } from 'react'
import { Badge } from './Badge'

interface PageHeaderProps {
  eyebrow: string
  title: ReactNode
  subtitle: string
  action?: ReactNode
  classColor?: string
  accent?: string
}

export function PageHeader({ eyebrow, title, subtitle, action, classColor, accent }: PageHeaderProps) {
  return (
    <header
      className="page-header"
      data-class-color={classColor}
      data-class-accent={accent}
    >
      {accent !== 'solid' && (
        <span className="stripe stripe--fade" aria-hidden="true" />
      )}
      <div className="page-header__inner">
        <div className="page-header__copy">
          <Badge className="page-header__badge">{eyebrow}</Badge>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {action && <div className="page-header__action">{action}</div>}
      </div>
    </header>
  )
}
