import { Check } from 'lucide-react'
import type { LearningCanvasColor } from '../types'
import { LEARNING_CANVAS_COLORS } from '../constants'

interface CardColorPickerProps {
  value: LearningCanvasColor
  onChange: (color: LearningCanvasColor) => void
  disabled?: boolean
}

const COLOR_LABELS: Record<LearningCanvasColor, string> = {
  none: 'Default white',
  navy: 'Navy highlight',
  tint: 'Light navy tint',
  c1: 'Class color 1',
  c2: 'Class color 2',
  c3: 'Class color 3',
  c4: 'Class color 4',
  c5: 'Class color 5',
  c6: 'Class color 6',
}

export function CardColorPicker({ value, onChange, disabled = false }: CardColorPickerProps) {
  return (
    <div
      className="flex items-center gap-1.5 p-1 rounded-xl bg-white border border-navy-900-12 shadow-sm"
      role="radiogroup"
      aria-label="Card color palette"
    >
      {LEARNING_CANVAS_COLORS.map((color) => {
        const isSelected = value === color
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={COLOR_LABELS[color]}
            disabled={disabled}
            onClick={() => onChange(color)}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-navy-800 ${
              isSelected ? 'ring-2 ring-navy-800 scale-105' : ''
            } learning-card--${color}`}
          >
            {isSelected && <Check size={14} className="text-navy-900 shrink-0" aria-hidden="true" />}
          </button>
        )
      })}
    </div>
  )
}
