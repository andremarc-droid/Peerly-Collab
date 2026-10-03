import { useId, type ReactNode } from 'react'
import { CircleHelp } from 'lucide-react'

export function Tooltip({ label, children }: { label: string; children?: ReactNode }) {
  const id = useId()
  return <span className="tooltip"><button className="tooltip__trigger" type="button" aria-label={label} aria-describedby={id}>{children ?? <CircleHelp size={18} aria-hidden="true" />}</button><span className="tooltip__bubble" role="tooltip" id={id}>{label}</span></span>
}
