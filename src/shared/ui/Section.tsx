import type { HTMLAttributes, ReactNode } from 'react'
import { Container } from './Container'

interface SectionProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode
  id?: string
  tone?: 'light' | 'navy' | 'muted'
}

export function Section({ children, id, tone = 'light', className = '', ...props }: SectionProps) {
  return <section className={`section section--${tone} ${className}`.trim()} id={id} {...props}><Container>{children}</Container></section>
}
