import { useEffect, useRef } from 'react'

interface SegmentOption { label: string; value: string }
interface SegmentedControlProps {
  label: string
  value: string
  options: SegmentOption[]
  onChange: (value: string) => void
  disabled?: boolean
}

export function SegmentedControl({ label, value, options, onChange, disabled }: SegmentedControlProps) {
  const rootRef = useRef<HTMLDivElement>(null)

  // On phones the control is a single scrollable strip. Keep the selected option in view by scrolling the
  // strip itself (never the page), so tabs that sit off-screen are not hidden after a selection.
  useEffect(() => {
    const root = rootRef.current
    const selected = root?.querySelector<HTMLElement>('button.is-selected')
    if (!root || !selected || typeof root.scrollTo !== 'function') return
    if (root.scrollWidth <= root.clientWidth) return
    const left = selected.offsetLeft - (root.clientWidth - selected.offsetWidth) / 2
    root.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
  }, [value])

  return <div className="segmented-control" role="group" aria-label={label} ref={rootRef}>{options.map((option) => <button type="button" key={option.value} className={value === option.value ? 'is-selected' : ''} aria-pressed={value === option.value} onClick={() => onChange(option.value)} disabled={disabled}>{option.label}</button>)}</div>
}
