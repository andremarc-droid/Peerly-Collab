interface SkeletonProps {
  className?: string
  label?: string
}

export function Skeleton({ className = '', label = 'Loading content' }: SkeletonProps) {
  return <span className={`skeleton ${className}`.trim()} role="status" aria-label={label} />
}
