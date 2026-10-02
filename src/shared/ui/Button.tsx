import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'inverse'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  to?: string
  variant?: ButtonVariant
  className?: string
}

export function Button({ children, to, variant = 'primary', className = '', ...props }: ButtonProps) {
  const classes = `button button--${variant} ${className}`.trim()
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
