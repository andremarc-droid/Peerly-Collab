import { Check } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { ClassInitialBadge } from './ClassInitialBadge'
import { COLOR_OPTIONS, type ClassAccent, type ClassColor } from './types'

export function ClassColorPicker({
  value,
  onChange,
  accent = 'pinstripe',
  previewName = 'Class Preview',
  previewSection = 'Section 1A · General Practice',
}: {
  value: ClassColor
  onChange: (value: ClassColor) => void
  accent?: ClassAccent
  previewName?: string
  previewSection?: string
}) {
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>, currentIndex: number) {
    let nextIndex = -1
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      nextIndex = (currentIndex + 1) % COLOR_OPTIONS.length
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      nextIndex = (currentIndex - 1 + COLOR_OPTIONS.length) % COLOR_OPTIONS.length
    }
    if (nextIndex >= 0) {
      onChange(COLOR_OPTIONS[nextIndex].value)
      const input = document.getElementById(`class-color-${COLOR_OPTIONS[nextIndex].value}`)
      input?.focus()
    }
  }

  const selectedOption = COLOR_OPTIONS.find((c) => c.value === value) ?? COLOR_OPTIONS[0]

  return (
    <fieldset className="grid gap-3 border-0 p-0 m-0">
      <div className="flex items-center justify-between">
        <legend className="field__label m-0">Class color</legend>
        <span className="text-sm font-semibold text-navy-800-72">{selectedOption.label}</span>
      </div>

      <div
        role="radiogroup"
        aria-label="Class color options"
        className="flex flex-wrap items-center gap-2.5"
      >
        {COLOR_OPTIONS.map((item, index) => {
          const isSelected = value === item.value
          return (
            <label
              key={item.value}
              htmlFor={`class-color-${item.value}`}
              className="relative inline-flex items-center justify-center cursor-pointer min-w-11 min-h-11"
              title={item.label}
            >
              <input
                type="radio"
                id={`class-color-${item.value}`}
                name="class-color"
                value={item.value}
                checked={isSelected}
                onChange={() => onChange(item.value)}
                onKeyDown={(e) => onKeyDown(e, index)}
                aria-label={item.label}
                className="sr-only class-color-picker__radio"
              />
              <span
                data-class-color={item.value}
                className={`class-color-picker__swatch ${isSelected ? 'class-color-picker__swatch--selected' : ''}`}
                aria-hidden="true"
              >
                {isSelected && <Check size={18} className="text-white stroke-[2.5]" aria-hidden="true" />}
              </span>
            </label>
          )
        })}
      </div>

      {/* Live Preview Tile */}
      <div className="grid gap-1.5 mt-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-navy-800-72">Preview tile</span>
        <div
          data-class-color={value}
          className="overflow-hidden rounded-2xl border border-navy-900-10 bg-white shadow-sm"
        >
          <div className="relative min-h-[96px] p-4 text-white flex flex-col justify-between overflow-hidden bg-[var(--class-color)]">
            {accent !== 'solid' && (
              <span
                className={`class-tile__pattern class-tile__pattern--${accent}`}
                aria-hidden="true"
              />
            )}
            <div className="relative z-1 flex items-start gap-2.5">
              <ClassInitialBadge name={previewName} color={value} />
              <div className="min-w-0 flex-1">
                <h4 className="m-0 font-heading text-lg font-bold leading-tight text-white truncate">
                  {previewName}
                </h4>
                <p className="m-0 text-sm text-white-72 truncate mt-0.5">{previewSection}</p>
              </div>
            </div>
          </div>
          <div className="p-3 text-sm text-navy-800-72 flex items-center justify-between bg-white">
            <span>0 students · 0 quizzes</span>
            <span className="font-semibold text-navy-900">Active</span>
          </div>
        </div>
      </div>
    </fieldset>
  )
}
