import type { ReactNode } from 'react'
import { useIsMobileView } from '../../lib/platform/isMobileView'
import { Badge } from './Badge'
import { M3PageHeader } from './m3/M3PageHeader'

interface PageHeaderProps {
  eyebrow: string
  title: ReactNode
  subtitle: string
  action?: ReactNode
  /** On phones, replaces `action`. Pass `null` to hide a desktop-only control such as a Back button. */
  mobileAction?: ReactNode
  classColor?: string
  accent?: string
}

export function PageHeader({ eyebrow, title, subtitle, action, mobileAction, classColor, accent }: PageHeaderProps) {
  if (useIsMobileView()) {
    return <M3PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} action={action} mobileAction={mobileAction} />
  }

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
