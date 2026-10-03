import type { ReactNode } from 'react'

interface StatTileProps {
  label: string
  value: string
  hint: string
}

export function StatTile({ label, value, hint }: StatTileProps) {
  return <article className="stat-tile"><span className="stat-tile__label">{label}</span><strong>{value}</strong><span className="stat-tile__hint">{hint}</span></article>
}

export function StatRow({ children }: { children: ReactNode }) {
  return <div className="stat-row" aria-label="Learning statistics">{children}</div>
}

