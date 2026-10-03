interface SegmentOption { label: string; value: string }
interface SegmentedControlProps {
  label: string
  value: string
  options: SegmentOption[]
  onChange: (value: string) => void
  disabled?: boolean
}

export function SegmentedControl({ label, value, options, onChange, disabled }: SegmentedControlProps) {
  return <div className="segmented-control" role="group" aria-label={label}>{options.map((option) => <button type="button" key={option.value} className={value === option.value ? 'is-selected' : ''} aria-pressed={value === option.value} onClick={() => onChange(option.value)} disabled={disabled}>{option.label}</button>)}</div>
}
