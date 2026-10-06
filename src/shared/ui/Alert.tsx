import type { ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'

export type AlertTone = 'success' | 'error' | 'warning' | 'info'

interface AlertProps {
  tone: AlertTone
  label: string
  children: ReactNode
  action?: ReactNode
}

const alertIcons = { success: CircleCheck, error: CircleAlert, warning: TriangleAlert, info: Info }

export function Alert({ tone, label, children, action }: AlertProps) {
  const Icon = alertIcons[tone]
  return (
    <div className={`alert alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon aria-hidden="true" size={20} />
      <div className="alert__content"><strong>{label}</strong><span>{children}</span>{action && <div className="alert__action">{action}</div>}</div>
    </div>
  )
}
