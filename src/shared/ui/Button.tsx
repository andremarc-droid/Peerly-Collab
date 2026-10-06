import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'inverse' | 'tertiary'
export type ButtonSurface = 'light' | 'navy'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  to?: string
  variant?: ButtonVariant
  surface?: ButtonSurface
  className?: string
}

export function Button({ children, to, variant = 'primary', surface, className = '', ...props }: ButtonProps) {
  const surfaceClass = surface ? `button--on-${surface}` : ''
  const classes = `button button--${variant} ${surfaceClass} ${className}`.trim()
  return to ? (
    <Link className={classes} to={to}>
      {children}
    </Link>
  ) : (
    <button className={classes} {...props}>
      {children}
    </button>
  )
}
