import { ClassPattern } from './ClassPatterns'
import type { ClassAccent } from './types'

const options: Array<{ value: ClassAccent; label: string }> = [
  { value: 'pinstripe', label: 'Pinstripe' },
  { value: 'stripeFade', label: 'Soft stripes' },
  { value: 'solid', label: 'Solid navy' },
]

export function ClassAccentPicker({ value, onChange }: { value: ClassAccent; onChange: (value: ClassAccent) => void }) {
  return <fieldset className="grid gap-2 border-0 p-0">
    <legend className="field__label">Class pattern</legend>
    <div className="grid gap-3 sm:grid-cols-3">
      {options.map((item) => <label key={item.value} className={`grid cursor-pointer gap-2 rounded-2xl border p-3 ${value === item.value ? 'border-navy-800 bg-navy-900-08' : 'border-navy-900-12 bg-white'}`}>
        <span className="flex min-h-11 items-center gap-2"><input type="radio" name="class-pattern" value={item.value} checked={value === item.value} onChange={() => onChange(item.value)} /><strong>{item.label}</strong></span>
        <ClassPattern accent={item.value} />
      </label>)}
    </div>
  </fieldset>
}
