import type { ClassAccent } from './types'

const patterns: Record<ClassAccent, string> = {
  pinstripe: 'bg-[repeating-linear-gradient(90deg,transparent_0,transparent_9px,var(--color-navy-900-12)_10px,var(--color-navy-900-12)_11px)]',
  stripeFade: 'bg-[repeating-linear-gradient(90deg,transparent_0,transparent_14px,var(--color-navy-900-12)_15px,var(--color-navy-900-12)_16px)]',
  solid: 'bg-navy-900-08',
}

export function ClassPattern({ accent, className = '' }: { accent: ClassAccent; className?: string }) {
  return <span aria-hidden="true" className={`block h-12 rounded-xl ${patterns[accent]} ${className}`} />
}

