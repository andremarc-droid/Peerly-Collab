import type { ClassColor } from './types'

export function ClassInitialBadge({
  name,
  color = 'navy',
  className = '',
}: {
  name: string
  color?: ClassColor
  className?: string
}) {
  const initial = (name.trim().charAt(0) || 'C').toUpperCase()
  return (
    <span
      className={`class-initial-badge ${className}`}
      data-class-color={color}
      aria-hidden="true"
    >
      {initial}
    </span>
  )
}
