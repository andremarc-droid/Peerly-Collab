import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'

export type M3ButtonVariant = 'filled' | 'outlined' | 'text'

interface M3ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  /** Renders a link instead of a button. Button-only props (`onClick`, `disabled`, ...) are ignored on a link. */
  to?: string
  variant?: M3ButtonVariant
  className?: string
}

// The keyboard focus ring comes from `.m3-press:focus-visible` in m3.css. A Tailwind `focus-visible:outline-*`
// class would lose to the unlayered global `:focus-visible` rule, so none is used here.
const base = 'm3-press inline-flex min-h-14 items-center justify-center gap-2 rounded-full text-base font-semibold transition-colors'

// Horizontal padding lives with the variant: two `px-*` classes on one element do not reliably override each other.
const variants: Record<M3ButtonVariant, string> = {
  filled: 'px-6 bg-navy-900 text-white disabled:cursor-not-allowed disabled:bg-navy-900-12 disabled:text-navy-900',
  outlined:
    'px-6 border border-navy-900-30 bg-white text-navy-900 disabled:cursor-not-allowed disabled:border-navy-900-12 disabled:text-navy-900',
  text: 'px-4 bg-transparent text-navy-900 disabled:cursor-not-allowed',
}

/** Stadium-shaped Material 3 button with a state layer and ink ripple (see `m3.css`). */
export function M3Button({ children, to, variant = 'filled', className = '', ...props }: M3ButtonProps) {
  const classes = `${base} ${variants[variant]} ${className}`.trim()
  return to ? (
    <Link className={classes} to={to}>
      {children}
    </Link>
  ) : (
    <button className={classes} type="button" {...props}>
      {children}
    </button>
  )
}
