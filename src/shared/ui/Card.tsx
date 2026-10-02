import type { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  elevated?: boolean
}

export function Card({ children, elevated = false, className = '', ...props }: CardProps) {
  return <div className={`card${elevated ? ' card--elevated' : ''} ${className}`.trim()} {...props}>{children}</div>
}
