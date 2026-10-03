import type { ReactNode } from 'react'

interface StatTileProps {
  label: string
  value: string
  hint: string
  variant?: 'white' | 'navy'
  icon?: ReactNode
}

export function StatTile({ label, value, hint, variant = 'white', icon }: StatTileProps) {
  return <article className={`stat-tile stat-tile--${variant}`}><span className="stat-tile__label">{icon && <span className="stat-tile__icon" aria-hidden="true">{icon}</span>}{label}</span><strong>{value}</strong><span className="stat-tile__hint">{hint}</span></article>
}

export function StatRow({ children, label = 'Learning statistics' }: { children: ReactNode; label?: string }) {
  return <div className="stat-row" aria-label={label}>{children}</div>
}
