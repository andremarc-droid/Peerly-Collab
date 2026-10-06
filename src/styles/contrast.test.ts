import { describe, expect, it } from 'vitest'

// WCAG 2.1 relative luminance and contrast ratio calculations
export function relativeLuminance(rgb: [number, number, number]): number {
  const toLinear = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * toLinear(rgb[0]) + 0.7152 * toLinear(rgb[1]) + 0.0722 * toLinear(rgb[2])
}

export function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ]
}

export function compositeAlpha(
  fg: [number, number, number],
  alpha: number,
  bg: [number, number, number],
): [number, number, number] {
  return [
    Math.round(fg[0] * alpha + bg[0] * (1 - alpha)),
    Math.round(fg[1] * alpha + bg[1] * (1 - alpha)),
    Math.round(fg[2] * alpha + bg[2] * (1 - alpha)),
  ]
}

export function contrastRatio(
  color1: [number, number, number],
  color2: [number, number, number],
): number {
  const l1 = relativeLuminance(color1)
  const l2 = relativeLuminance(color2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

// Named tokens from tokens.css
const BRAND = {
  white: parseHex('#ffffff'),
  navy900: parseHex('#0d0d59'),
  navy800: parseHex('#050b6c'),
  navy700: parseHex('#0a178f'),
  feedbackSuccess: parseHex('#31594c'),
  feedbackSuccessBg: parseHex('#e5eee9'),
  feedbackWarning: parseHex('#68551e'),
  feedbackWarningBg: parseHex('#f3eedf'),
  feedbackError: parseHex('#743f46'),
  feedbackErrorBg: parseHex('#f2e6e7'),
  dangerText: parseHex('#991b1b'),
  dangerBg: parseHex('#fef2f2'),
  dangerBorder: parseHex('#fca5a5'),
}

describe('Automated Contrast Test: Core Tokens', () => {
  it('guarantees core text contrast pairs pass WCAG AA (>= 4.5:1) or AAA (>= 7.0:1)', () => {
    // White text on navy surfaces
    expect(contrastRatio(BRAND.white, BRAND.navy900)).toBeGreaterThanOrEqual(7.0)
    expect(contrastRatio(BRAND.white, BRAND.navy800)).toBeGreaterThanOrEqual(7.0)
    expect(contrastRatio(BRAND.white, BRAND.navy700)).toBeGreaterThanOrEqual(7.0)

    // Navy text on white surface
    expect(contrastRatio(BRAND.navy900, BRAND.white)).toBeGreaterThanOrEqual(7.0)

    // White text with opacity on navy-900
    const white72OnNavy = compositeAlpha(BRAND.white, 0.72, BRAND.navy900)
    expect(contrastRatio(white72OnNavy, BRAND.navy900)).toBeGreaterThanOrEqual(7.0)

    const white55OnNavy = compositeAlpha(BRAND.white, 0.55, BRAND.navy900)
    expect(contrastRatio(white55OnNavy, BRAND.navy900)).toBeGreaterThanOrEqual(4.5)

    // Navy text with opacity on white
    const navy800At72OnWhite = compositeAlpha(BRAND.navy800, 0.72, BRAND.white)
    expect(contrastRatio(navy800At72OnWhite, BRAND.white)).toBeGreaterThanOrEqual(7.0)

    // Feedback pairs
    expect(contrastRatio(BRAND.feedbackSuccess, BRAND.feedbackSuccessBg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(BRAND.feedbackWarning, BRAND.feedbackWarningBg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(BRAND.feedbackError, BRAND.feedbackErrorBg)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('Automated Contrast Test: canvas.css Tokens', () => {
  it('card text on card fill guarantees >= 4.5:1 contrast', () => {
    // Note card background is white or subtle gradient (rgba(245, 246, 255, 0.8) over white)
    const noteCardFill = compositeAlpha([245, 246, 255], 0.8, BRAND.white)

    // Note card title: navy-900 on fill
    const noteTitleRatio = contrastRatio(BRAND.navy900, noteCardFill)
    expect(noteTitleRatio).toBeGreaterThanOrEqual(7.0) // AAA

    // Note card body: navy-900 at 88% opacity on fill
    const noteBodyColor = compositeAlpha(BRAND.navy900, 0.88, noteCardFill)
    const noteBodyRatio = contrastRatio(noteBodyColor, noteCardFill)
    expect(noteBodyRatio).toBeGreaterThanOrEqual(4.5) // AA

    // Paragraph card text: navy-900 on white
    const paragraphRatio = contrastRatio(BRAND.navy900, BRAND.white)
    expect(paragraphRatio).toBeGreaterThanOrEqual(7.0)

    // Link card host: navy-800 on white
    const linkHostRatio = contrastRatio(BRAND.navy800, BRAND.white)
    expect(linkHostRatio).toBeGreaterThanOrEqual(7.0)

    // Link card hover: navy-700 on white
    const linkHoverRatio = contrastRatio(BRAND.navy700, BRAND.white)
    expect(linkHoverRatio).toBeGreaterThanOrEqual(7.0)

    // Image card fallback: navy-900 on white
    const imageFallbackRatio = contrastRatio(BRAND.navy900, BRAND.white)
    expect(imageFallbackRatio).toBeGreaterThanOrEqual(7.0)

    // Image card fallback hover: white on navy-800
    const imageHoverRatio = contrastRatio(BRAND.white, BRAND.navy800)
    expect(imageHoverRatio).toBeGreaterThanOrEqual(7.0)
  })

  it('edge status badges in review mode guarantee >= 4.5:1 contrast', () => {
    // Correct edge badge: feedback-success on feedback-success-bg
    const correctBadgeRatio = contrastRatio(BRAND.feedbackSuccess, BRAND.feedbackSuccessBg)
    expect(correctBadgeRatio).toBeGreaterThanOrEqual(4.5)

    // Wrong edge badge: danger-text on danger-bg
    const wrongBadgeRatio = contrastRatio(BRAND.dangerText, BRAND.dangerBg)
    expect(wrongBadgeRatio).toBeGreaterThanOrEqual(4.5)

    // Missed edge badge: navy-900 on white
    const missedBadgeRatio = contrastRatio(BRAND.navy900, BRAND.white)
    expect(missedBadgeRatio).toBeGreaterThanOrEqual(7.0)
  })

  it('minimap node elements guarantee >= 3.0:1 UI component contrast', () => {
    // Minimap node indicator (navy-900) against minimap board surface (white)
    const minimapNodeRatio = contrastRatio(BRAND.navy900, BRAND.white)
    expect(minimapNodeRatio).toBeGreaterThanOrEqual(3.0)

    // Minimap viewport indicator against minimap background
    const minimapMask = compositeAlpha(BRAND.navy700, 0.05, BRAND.white)
    expect(contrastRatio(BRAND.navy900, minimapMask)).toBeGreaterThanOrEqual(3.0)
  })

  it('card handles guarantee >= 3.0:1 UI component contrast', () => {
    // Handle visual indicator dot (navy-900) against card fill (white)
    const handleDotRatio = contrastRatio(BRAND.navy900, BRAND.white)
    expect(handleDotRatio).toBeGreaterThanOrEqual(3.0)

    // Handle hover indicator dot (navy-700) against card fill (white)
    const handleHoverRatio = contrastRatio(BRAND.navy700, BRAND.white)
    expect(handleHoverRatio).toBeGreaterThanOrEqual(3.0)

    // Handle white ring against handle navy dot
    const handleInnerRingRatio = contrastRatio(BRAND.white, BRAND.navy900)
    expect(handleInnerRingRatio).toBeGreaterThanOrEqual(3.0)
  })

  it('focus rings guarantee >= 3.0:1 UI component contrast', () => {
    // Light surface focus ring: navy-800 against white
    const lightFocusRatio = contrastRatio(BRAND.navy800, BRAND.white)
    expect(lightFocusRatio).toBeGreaterThanOrEqual(3.0)

    // Dark surface focus ring: white against navy-900
    const darkFocusRatio = contrastRatio(BRAND.white, BRAND.navy900)
    expect(darkFocusRatio).toBeGreaterThanOrEqual(3.0)

    // Double focus ring: inner white ring (2px) with outer navy-800 ring (4px)
    const doubleFocusContrast = contrastRatio(BRAND.white, BRAND.navy800)
    expect(doubleFocusContrast).toBeGreaterThanOrEqual(3.0)
  })
})

describe('Automated Contrast Test: modules.css Tokens', () => {
  it('module and resource cards guarantee >= 4.5:1 text contrast', () => {
    // Module card title: navy-900 on white
    expect(contrastRatio(BRAND.navy900, BRAND.white)).toBeGreaterThanOrEqual(7.0)

    // Module card description & meta: navy-800 at 72% opacity on white
    const metaColor = compositeAlpha(BRAND.navy800, 0.72, BRAND.white)
    expect(contrastRatio(metaColor, BRAND.white)).toBeGreaterThanOrEqual(4.5)

    // Resource card title: navy-900 on white
    expect(contrastRatio(BRAND.navy900, BRAND.white)).toBeGreaterThanOrEqual(7.0)

    // Student resource text: navy-900 on white
    expect(contrastRatio(BRAND.navy900, BRAND.white)).toBeGreaterThanOrEqual(7.0)

    // Resource embed fallback message: navy-800 at 72% on white
    expect(contrastRatio(metaColor, BRAND.white)).toBeGreaterThanOrEqual(4.5)

    // Resource embed fallback link: navy-800 on white
    expect(contrastRatio(BRAND.navy800, BRAND.white)).toBeGreaterThanOrEqual(7.0)
  })

  it('module publish bar guarantees >= 4.5:1 text contrast on navy-900', () => {
    // Publish bar title: white on navy-900
    expect(contrastRatio(BRAND.white, BRAND.navy900)).toBeGreaterThanOrEqual(7.0)

    // Publish bar secondary copy: white at 72% opacity on navy-900
    const white72 = compositeAlpha(BRAND.white, 0.72, BRAND.navy900)
    expect(contrastRatio(white72, BRAND.navy900)).toBeGreaterThanOrEqual(4.5)
  })
})
