import type { ReactNode } from 'react'
import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react'

type AlertTone = 'success' | 'error' | 'warning'

interface AlertProps {
  tone: AlertTone
  label: string
  children: ReactNode
}

const alertIcons = { success: CircleCheck, error: CircleAlert, warning: TriangleAlert }

export function Alert({ tone, label, children }: AlertProps) {
  const Icon = alertIcons[tone]
  return (
    <div className={`alert alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon aria-hidden="true" size={20} />
      <div><strong>{label}</strong><span>{children}</span></div>
    </div>
  )
}
