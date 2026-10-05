import { describe, expect, it } from 'vitest'
import { parseClass } from './schemas'
import { CLASS_COLORS, resolveClassColor, type ClassColor } from './types'
import { Timestamp } from 'firebase/firestore'

// WCAG 2.1 relative luminance calculation
function relativeLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '')
  const r = parseInt(cleanHex.slice(0, 2), 16) / 255
  const g = parseInt(cleanHex.slice(2, 4), 16) / 255
  const b = parseInt(cleanHex.slice(4, 6), 16) / 255

  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1)
  const l2 = relativeLuminance(hex2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

export const PALETTE_TOKENS: Record<ClassColor, { color: string; deep: string; tint: string }> = {
  navy: { color: '#0d0d59', deep: '#080838', tint: '#eef0f8' },
  ocean: { color: '#0b5cad', deep: '#084482', tint: '#edf5fd' },
  teal: { color: '#0f766e', deep: '#0a524c', tint: '#edf8f6' },
  green: { color: '#2f7d32', deep: '#1f5922', tint: '#edf7ed' },
  amber: { color: '#8a5a00', deep: '#634000', tint: '#fdf7eb' },
  rust: { color: '#b4440a', deep: '#823006', tint: '#fdf3ed' },
  crimson: { color: '#a61b2b', deep: '#79121e', tint: '#fdf0f2' },
  rose: { color: '#a21a63', deep: '#761247', tint: '#fdf0f6' },
  purple: { color: '#6a2fb0', deep: '#4d2182', tint: '#f6f0fd' },
  indigo: { color: '#3f3fb5', deep: '#2c2c84', tint: '#f0f0fd' },
  slate: { color: '#475569', deep: '#334155', tint: '#f1f5f9' },
}

const BRAND_WHITE = '#ffffff'
const BRAND_NAVY = '#0d0d59'

describe('Class Color Palette and Contrast', () => {
  it('contains exactly the 11 specified color keys', () => {
    expect(CLASS_COLORS).toEqual([
      'navy', 'ocean', 'teal', 'green', 'amber', 'rust',
      'crimson', 'rose', 'purple', 'indigo', 'slate',
    ])
    expect(Object.keys(PALETTE_TOKENS)).toEqual([...CLASS_COLORS])
  })

  it('guarantees white text on --class-color has at least 4.5:1 contrast for all colors', () => {
    for (const key of CLASS_COLORS) {
      const { color } = PALETTE_TOKENS[key]
      const ratio = contrastRatio(BRAND_WHITE, color)
      expect(ratio, `Color "${key}" (${color}) must have >= 4.5:1 contrast with white`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('guarantees navy text on --class-tint has at least 4.5:1 contrast for all colors', () => {
    for (const key of CLASS_COLORS) {
      const { tint } = PALETTE_TOKENS[key]
      const ratio = contrastRatio(BRAND_NAVY, tint)
      expect(ratio, `Tint "${key}" (${tint}) must have >= 4.5:1 contrast with navy (${BRAND_NAVY})`).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('Class Color Key Fallback', () => {
  it('resolves valid color keys to themselves', () => {
    for (const color of CLASS_COLORS) {
      expect(resolveClassColor(color)).toBe(color)
    }
  })

  it('falls back to "navy" for missing, null, undefined, or unknown colors', () => {
    expect(resolveClassColor(undefined)).toBe('navy')
    expect(resolveClassColor(null)).toBe('navy')
    expect(resolveClassColor('')).toBe('navy')
    expect(resolveClassColor('unknown-color')).toBe('navy')
    expect(resolveClassColor('gold')).toBe('navy')
    expect(resolveClassColor(123)).toBe('navy')
    expect(resolveClassColor({})).toBe('navy')
  })

  it('parses class with color and falls back to navy when color is omitted or invalid', () => {
    const now = Timestamp.now()
    const baseClass = {
      ownerId: 'u1',
      ownerName: 'Instructor',
      name: 'Algebra',
      section: 'Period 1',
      subject: 'Math',
      description: 'Intro to algebra',
      joinCode: 'ABC234',
      joinEnabled: true,
      requireApproval: false,
      status: 'active',
      accent: 'pinstripe',
      createdAt: now,
      updatedAt: now,
      codeRotatedAt: now,
    }

    // Without color field -> defaults to 'navy'
    const parsed1 = parseClass(baseClass)
    expect(parsed1.color).toBe('navy')

    // With valid color -> keeps it
    const parsed2 = parseClass({ ...baseClass, color: 'ocean' })
    expect(parsed2.color).toBe('ocean')

    // With unknown color -> falls back to 'navy'
    const parsed3 = parseClass({ ...baseClass, color: 'invalid-hue' })
    expect(parsed3.color).toBe('navy')
  })
})
