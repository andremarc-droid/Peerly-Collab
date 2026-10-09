import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// ============================================================================
// 1. Color parsing & WCAG Relative Luminance / Contrast Utilities
// ============================================================================

export interface RGBA {
  r: number
  g: number
  b: number
  a: number
}

export function relativeLuminance(rgb: [number, number, number]): number {
  const toLinear = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * toLinear(rgb[0]) + 0.7152 * toLinear(rgb[1]) + 0.0722 * toLinear(rgb[2])
}

export function parseColor(raw: string): RGBA {
  const value = raw.trim()

  // Hex: #ffffff or #fff
  if (value.startsWith('#')) {
    const clean = value.replace('#', '')
    if (clean.length === 3) {
      return {
        r: parseInt(clean[0] + clean[0], 16),
        g: parseInt(clean[1] + clean[1], 16),
        b: parseInt(clean[2] + clean[2], 16),
        a: 1,
      }
    }
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
      a: clean.length >= 8 ? parseInt(clean.slice(6, 8), 16) / 255 : 1,
    }
  }

  // rgb(r g b / a) modern notation
  const modernRgb = value.match(/rgb\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+%?))?\s*\)/i)
  if (modernRgb) {
    const r = parseInt(modernRgb[1], 10)
    const g = parseInt(modernRgb[2], 10)
    const b = parseInt(modernRgb[3], 10)
    let a = 1
    if (modernRgb[4]) {
      const alphaStr = modernRgb[4]
      a = alphaStr.endsWith('%') ? parseFloat(alphaStr) / 100 : parseFloat(alphaStr)
    }
    return { r, g, b, a }
  }

  // legacy rgb(r, g, b) or rgba(r, g, b, a)
  const legacyRgb = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+%?))?\s*\)/i)
  if (legacyRgb) {
    const r = parseInt(legacyRgb[1], 10)
    const g = parseInt(legacyRgb[2], 10)
    const b = parseInt(legacyRgb[3], 10)
    let a = 1
    if (legacyRgb[4]) {
      const alphaStr = legacyRgb[4]
      a = alphaStr.endsWith('%') ? parseFloat(alphaStr) / 100 : parseFloat(alphaStr)
    }
    return { r, g, b, a }
  }

  throw new Error(`Unable to parse color value: "${raw}"`)
}

export function parseCssTokens(cssContent: string): Map<string, string> {
  const tokenMap = new Map<string, string>()
  const varRegex = /--([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g
  let match: RegExpExecArray | null
  while ((match = varRegex.exec(cssContent)) !== null) {
    const name = `--${match[1].trim()}`
    const rawVal = match[2].trim()
    tokenMap.set(name, rawVal)
  }
  return tokenMap
}

export function resolveTokenColor(
  tokenName: string,
  tokenMap: Map<string, string>,
  visited = new Set<string>(),
): RGBA {
  if (visited.has(tokenName)) {
    throw new Error(`Circular token reference detected at ${tokenName}`)
  }
  visited.add(tokenName)

  const raw = tokenMap.get(tokenName)
  if (!raw) {
    throw new Error(`Token "${tokenName}" not found in CSS definitions`)
  }

  if (raw.startsWith('var(')) {
    const inner = raw.match(/var\((--[a-zA-Z0-9_-]+)\)/)?.[1]
    if (!inner) throw new Error(`Invalid var() reference in ${tokenName}: "${raw}"`)
    return resolveTokenColor(inner, tokenMap, visited)
  }

  return parseColor(raw)
}

export function resolveCssValueToColor(value: string | undefined, tokenMap: Map<string, string>): RGBA | null {
  if (!value || value === 'transparent') return null
  const varMatch = value.match(/var\((--[a-zA-Z0-9_-]+)\)/)
  if (varMatch) {
    return resolveTokenColor(varMatch[1], tokenMap)
  }
  return parseColor(value)
}

export function compositeAlphaOverSolid(
  fg: RGBA,
  bg: [number, number, number],
): [number, number, number] {
  return [
    Math.round(fg.r * fg.a + bg[0] * (1 - fg.a)),
    Math.round(fg.g * fg.a + bg[1] * (1 - fg.a)),
    Math.round(fg.b * fg.a + bg[2] * (1 - fg.a)),
  ]
}

export function contrastRatio(
  c1: [number, number, number],
  c2: [number, number, number],
): number {
  const l1 = relativeLuminance(c1)
  const l2 = relativeLuminance(c2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

// ============================================================================
// 2. CSS Rules Parser
// ============================================================================

export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

export function parseCssDeclarations(declStr: string): Map<string, string> {
  const map = new Map<string, string>()
  const items = declStr.split(';')
  for (const item of items) {
    const colonIdx = item.indexOf(':')
    if (colonIdx === -1) continue
    const prop = item.slice(0, colonIdx).trim().toLowerCase()
    const val = item.slice(colonIdx + 1).trim()
    if (prop && val) {
      map.set(prop, val)
    }
  }
  return map
}

export function parseAllCssRules(css: string): Map<string, Map<string, string>> {
  const clean = stripComments(css)
  const rules = new Map<string, Map<string, string>>()

  let i = 0
  while (i < clean.length) {
    const openBrace = clean.indexOf('{', i)
    if (openBrace === -1) break

    const selectorPart = clean.slice(i, openBrace).trim()
    let depth = 1
    let j = openBrace + 1
    while (j < clean.length && depth > 0) {
      if (clean[j] === '{') depth++
      else if (clean[j] === '}') depth--
      j++
    }
    const body = clean.slice(openBrace + 1, j - 1).trim()
    i = j

    if (
      selectorPart.startsWith('@keyframes') ||
      selectorPart.startsWith('@font-face') ||
      selectorPart.startsWith('@import')
    ) {
      continue
    }

    if (selectorPart.startsWith('@media')) {
      const nested = parseAllCssRules(body)
      for (const [sel, decls] of nested) {
        if (!rules.has(sel)) {
          rules.set(sel, new Map())
        }
        for (const [p, v] of decls) {
          rules.get(sel)!.set(p, v)
        }
      }
      continue
    }

    const selectors = selectorPart.split(',').map((s) => s.trim().replace(/\s+/g, ' '))
    const decls = parseCssDeclarations(body)

    for (const sel of selectors) {
      if (!sel) continue
      if (!rules.has(sel)) {
        rules.set(sel, new Map())
      }
      for (const [p, v] of decls) {
        rules.get(sel)!.set(p, v)
      }
    }
  }

  return rules
}

export function loadAllCssRules(): { rules: Map<string, Map<string, string>>; tokens: Map<string, string> } {
  const stylesDir = path.resolve(process.cwd(), 'src/styles')
  const tokensCss = fs.readFileSync(path.join(stylesDir, 'tokens.css'), 'utf8')
  const tokens = parseCssTokens(tokensCss)

  const combinedRules = new Map<string, Map<string, string>>()
  const cssFiles = fs.readdirSync(stylesDir).filter((f) => f.endsWith('.css'))

  for (const f of cssFiles) {
    const content = fs.readFileSync(path.join(stylesDir, f), 'utf8')
    const fileRules = parseAllCssRules(content)
    for (const [sel, decls] of fileRules) {
      if (!combinedRules.has(sel)) {
        combinedRules.set(sel, new Map())
      }
      for (const [p, v] of decls) {
        combinedRules.get(sel)!.set(p, v)
      }
    }
  }

  const extraFiles = [
    'src/features/canvas/canvas.css',
    'src/features/modules/modules.css',
    'src/features/learningCanvas/learningCanvas.css',
  ]
  for (const ef of extraFiles) {
    const fullPath = path.resolve(process.cwd(), ef)
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8')
      const fileRules = parseAllCssRules(content)
      for (const [sel, decls] of fileRules) {
        if (!combinedRules.has(sel)) {
          combinedRules.set(sel, new Map())
        }
        for (const [p, v] of decls) {
          combinedRules.get(sel)!.set(p, v)
        }
      }
    }
  }

  return { rules: combinedRules, tokens }
}

// ============================================================================
// 3. Bound & Token Registries
// ============================================================================

export interface BoundContrastEntry {
  name: string
  selector: string
  containerSelector?: string
  minRatio: number
  baseSolid?: [number, number, number]
}

export const BOUND_CONTRAST_REGISTRY: BoundContrastEntry[] = [
  // Button variants
  { name: 'Button primary on light', selector: '.button--primary', minRatio: 4.5 },
  { name: 'Button secondary on light', selector: '.button--secondary', minRatio: 4.5 },
  { name: 'Button tertiary on light', selector: '.button--tertiary', containerSelector: 'body', minRatio: 4.5 },
  { name: 'Button on-navy primary', selector: '.button--on-navy.button--primary', minRatio: 4.5 },
  { name: 'Button on-navy secondary', selector: '.button--on-navy.button--secondary', containerSelector: '.page-header', minRatio: 4.5 },
  { name: 'Button destructive primary', selector: '.button--destructive', minRatio: 4.5 },
  { name: 'Button destructive secondary', selector: '.button--secondary.button--destructive', minRatio: 4.5 },

  // Tabs inactive, hover, selected
  { name: 'Tabs inactive label', selector: '.tabs__list button:not([aria-selected="true"])', containerSelector: '.tabs__list', minRatio: 4.5 },
  { name: 'Tabs hover label', selector: '.tabs__list button:not([aria-selected="true"]):hover', minRatio: 4.5 },
  { name: 'Tabs selected label', selector: '.tabs__list button[aria-selected="true"]', minRatio: 4.5 },

  // Tab count badges
  { name: 'Tab selected count badge', selector: '.tabs__list button[aria-selected="true"] .tabs__count', minRatio: 4.5 },
  { name: 'Tab inactive count badge', selector: '.tabs__list button:not([aria-selected="true"]) .tabs__count', minRatio: 4.5 },

  // Badge variants
  { name: 'Badge on light surface', selector: '.badge', minRatio: 4.5 },
  { name: 'Badge on navy surface (page-header)', selector: '.page-header__badge', minRatio: 4.5 },

  // Alert title and body
  { name: 'Alert title', selector: '.alert strong', containerSelector: '.alert', minRatio: 4.5 },
  { name: 'Alert body', selector: '.alert span', containerSelector: '.alert', minRatio: 4.5 },

  // Stat tile navy and white
  { name: 'Stat tile white', selector: '.stat-tile', minRatio: 4.5 },
  { name: 'Stat tile navy', selector: '.stat-tile--navy', minRatio: 4.5 },

  // Empty state title and body
  { name: 'Empty state title', selector: '.empty-state h2', containerSelector: '.empty-state', minRatio: 4.5 },
  { name: 'Empty state body', selector: '.empty-state p', containerSelector: '.empty-state', minRatio: 4.5 },

  // Class-code panel
  { name: 'Class-code panel', selector: '.class-code-panel', minRatio: 4.5 },

  // Header title, subtitle, badge
  { name: 'Header title', selector: '.page-header h1', containerSelector: '.page-header', minRatio: 4.5 },
  { name: 'Header subtitle', selector: '.page-header p', containerSelector: '.page-header', minRatio: 4.5 },

  // Page-header buttons
  { name: 'Page-header button primary', selector: '.page-header__action .button--primary', minRatio: 4.5 },
  { name: 'Page-header button secondary', selector: '.page-header__action .button--secondary', containerSelector: '.page-header', minRatio: 4.5 },

  // Phone signed-in chrome (m3.css): light canvas, navy text, no navy band
  { name: 'Phone dashboard header title', selector: '.page-header--m3 h1', containerSelector: '.page-header--m3', minRatio: 4.5 },
  { name: 'Phone dashboard header subtitle', selector: '.page-header--m3 p', containerSelector: '.page-header--m3', minRatio: 4.5 },
  { name: 'Phone dashboard header chip', selector: '.page-header--m3 .page-header__badge', minRatio: 4.5 },
  { name: 'Phone dashboard header primary button', selector: '.page-header--m3 .page-header__action .button--primary', minRatio: 4.5 },
  { name: 'Phone dashboard header secondary button', selector: '.page-header--m3 .page-header__action .button--secondary', containerSelector: '.page-header--m3', minRatio: 4.5 },
  { name: 'Phone dashboard tab selected', selector: '.app-shell--m3 .tabs__list button[aria-selected="true"]', containerSelector: '.app-shell--m3', minRatio: 4.5 },
  { name: 'Phone dashboard tab inactive', selector: '.app-shell--m3 .tabs__list button:not([aria-selected="true"])', containerSelector: '.app-shell--m3', minRatio: 4.5 },
  { name: 'Phone dashboard nav bar', selector: '.app-shell--m3 .m3-nav', minRatio: 4.5 },

  // Dialog and Toast
  { name: 'Dialog', selector: '.dialog', minRatio: 4.5 },
  { name: 'Toast title', selector: '.toast > strong', containerSelector: '.toast', minRatio: 4.5 },
  { name: 'Toast body', selector: '.toast > span', containerSelector: '.toast', minRatio: 4.5 },

  // Field label, hint, error
  { name: 'Field label', selector: '.field__label', minRatio: 4.5 },
  { name: 'Field hint', selector: '.field__hint', minRatio: 4.5 },
  { name: 'Field error', selector: '.field__error', minRatio: 4.5 },

  // Data table header
  { name: 'Data table header', selector: '.data-table th', minRatio: 4.5 },

  // Segmented control
  { name: 'Segmented control inactive', selector: '.segmented-control button', containerSelector: '.segmented-control', minRatio: 4.5 },
  { name: 'Segmented control selected', selector: '.segmented-control button.is-selected', minRatio: 4.5 },
]

export interface TokenContrastEntry {
  name: string
  fgToken: string
  bgToken: string
  minRatio: number
  baseSolid?: [number, number, number]
}

export const TOKEN_ONLY_CONTRAST_REGISTRY: TokenContrastEntry[] = [
  // Semantic status pairs
  { name: 'Feedback success text on success surface', fgToken: '--color-feedback-success', bgToken: '--color-feedback-success-bg', minRatio: 4.5 },
  { name: 'Feedback warning text on warning surface', fgToken: '--color-feedback-warning', bgToken: '--color-feedback-warning-bg', minRatio: 4.5 },
  { name: 'Feedback error text on error surface', fgToken: '--color-feedback-error', bgToken: '--color-feedback-error-bg', minRatio: 4.5 },
  { name: 'Danger text on danger background', fgToken: '--color-danger-text', bgToken: '--color-danger-bg', minRatio: 4.5 },

  // Focus rings and borders (UI components: 3.0:1)
  { name: 'Focus ring on white canvas', fgToken: '--color-navy-700', bgToken: '--color-white', minRatio: 3.0 },
  { name: 'Focus ring on tinted canvas', fgToken: '--color-navy-700', bgToken: '--color-navy-700-05', minRatio: 3.0 },
  { name: 'Focus ring on navy surface', fgToken: '--color-white', bgToken: '--color-navy-900', minRatio: 3.0 },
  { name: 'Active control border on white', fgToken: '--color-navy-800', bgToken: '--color-white', minRatio: 3.0 },
  { name: 'Alert left accent bar: success', fgToken: '--color-feedback-success', bgToken: '--color-white', minRatio: 3.0 },
  { name: 'Alert left accent bar: error', fgToken: '--color-feedback-error', bgToken: '--color-white', minRatio: 3.0 },
  { name: 'Alert left accent bar: warning', fgToken: '--color-feedback-warning', bgToken: '--color-white', minRatio: 3.0 },
  { name: 'Alert left accent bar: info', fgToken: '--color-navy-800', bgToken: '--color-white', minRatio: 3.0 },
  { name: 'Danger border on danger bg', fgToken: '--color-danger', bgToken: '--color-danger-bg', minRatio: 3.0 },

  // Phone text fields (m3.css `.m3-field`): outline, focus outline, error outline, placeholder, error message
  { name: 'Phone field outline on white', fgToken: '--color-navy-800-72', bgToken: '--color-white', minRatio: 3.0 },
  { name: 'Phone field focus outline on white', fgToken: '--color-navy-900', bgToken: '--color-white', minRatio: 3.0 },
  { name: 'Phone field error outline on white', fgToken: '--color-feedback-error', bgToken: '--color-white', minRatio: 3.0 },
  { name: 'Phone field placeholder on white', fgToken: '--color-navy-800-72', bgToken: '--color-white', minRatio: 4.5 },
  { name: 'Phone field error message on white', fgToken: '--color-feedback-error', bgToken: '--color-white', minRatio: 4.5 },
  { name: 'Phone dashboard title on white', fgToken: '--color-navy-900', bgToken: '--color-white', minRatio: 4.5 },
  { name: 'Phone nav unselected label on white', fgToken: '--color-navy-800-72', bgToken: '--color-white', minRatio: 4.5 },
  { name: 'Phone nav selected label on tint', fgToken: '--color-navy-900', bgToken: '--color-navy-700-07', minRatio: 4.5 },
  { name: 'Phone class card title on white', fgToken: '--color-navy-900', bgToken: '--color-white', minRatio: 4.5 },

  // Activity type badges (quiz / flashcards / canvas)
  { name: 'Quiz type badge text on its tint', fgToken: '--color-kind-quiz-fg', bgToken: '--color-kind-quiz-bg', minRatio: 4.5 },
  { name: 'Flashcards type badge text on its tint', fgToken: '--color-kind-flashcards-fg', bgToken: '--color-kind-flashcards-bg', minRatio: 4.5 },
  { name: 'Canvas type badge text on its tint', fgToken: '--color-kind-canvas-fg', bgToken: '--color-kind-canvas-bg', minRatio: 4.5 },
  { name: 'Quiz type badge border on white', fgToken: '--color-kind-quiz-border', bgToken: '--color-white', minRatio: 3.0 },
  { name: 'Flashcards type badge border on white', fgToken: '--color-kind-flashcards-border', bgToken: '--color-white', minRatio: 3.0 },
  { name: 'Canvas type badge border on white', fgToken: '--color-kind-canvas-border', bgToken: '--color-white', minRatio: 3.0 },

  // Canvas graph pairs
  { name: 'Canvas card title on white', fgToken: '--color-navy-900', bgToken: '--color-white', minRatio: 4.5 },
  { name: 'Canvas note card body on white', fgToken: '--color-navy-900-88', bgToken: '--color-white', minRatio: 4.5 },
  { name: 'Canvas link host on white', fgToken: '--color-navy-800', bgToken: '--color-white', minRatio: 4.5 },
  { name: 'Canvas link hover on white', fgToken: '--color-navy-700', bgToken: '--color-white', minRatio: 4.5 },
  { name: 'Canvas edge correct badge on success bg', fgToken: '--color-feedback-success', bgToken: '--color-feedback-success-bg', minRatio: 4.5 },
  { name: 'Canvas edge wrong badge on danger bg', fgToken: '--color-danger-text', bgToken: '--color-danger-bg', minRatio: 4.5 },
  { name: 'Canvas edge missed badge on white', fgToken: '--color-navy-900', bgToken: '--color-white', minRatio: 4.5 },
  { name: 'Canvas minimap node on white', fgToken: '--color-navy-900', bgToken: '--color-white', minRatio: 3.0 },
  { name: 'Canvas handle dot on white', fgToken: '--color-navy-900', bgToken: '--color-white', minRatio: 3.0 },
  { name: 'Canvas double focus ring (white on navy-800)', fgToken: '--color-white', bgToken: '--color-navy-800', minRatio: 3.0 },

  // Learning canvas items
  { name: 'Learning canvas card text on white', fgToken: '--color-navy-900', bgToken: '--color-white', minRatio: 4.5 },
  { name: 'Learning canvas card text on navy-08', fgToken: '--color-navy-900', bgToken: '--color-navy-900-08', minRatio: 4.5 },
  { name: 'Learning canvas card text on tint', fgToken: '--color-navy-900', bgToken: '--color-navy-700-05', minRatio: 4.5 },
  { name: 'Learning canvas group label on white', fgToken: '--color-navy-900', bgToken: '--color-white', minRatio: 4.5 },
  { name: 'Learning canvas link title on white', fgToken: '--color-navy-900', bgToken: '--color-white', minRatio: 4.5 },
  { name: 'Learning canvas edge label text on white', fgToken: '--color-navy-900', bgToken: '--color-white', minRatio: 4.5 },

  // Module items
  { name: 'Module card title on white', fgToken: '--color-navy-900', bgToken: '--color-white', minRatio: 4.5 },
  { name: 'Module card meta on white', fgToken: '--color-navy-800-72', bgToken: '--color-white', minRatio: 4.5 },
  { name: 'Module publish bar title on navy-900', fgToken: '--color-white', bgToken: '--color-navy-900', minRatio: 4.5 },
  { name: 'Module publish bar copy on navy-900', fgToken: '--color-white-72', bgToken: '--color-navy-900', minRatio: 4.5 },
  { name: 'Resource embed fallback text on white', fgToken: '--color-navy-800-72', bgToken: '--color-white', minRatio: 4.5 },
  { name: 'Resource embed fallback link on white', fgToken: '--color-navy-800', bgToken: '--color-white', minRatio: 4.5 },
]

export function measureBoundPair(
  entry: BoundContrastEntry,
  rules: Map<string, Map<string, string>>,
  tokens: Map<string, string>,
): { ratio: number; fgRgb: [number, number, number]; bgRgb: [number, number, number]; fgToken: string; bgToken: string } {
  const rule = rules.get(entry.selector)
  if (!rule) {
    throw new Error(`CSS rule for selector "${entry.selector}" is missing in styles definitions.`)
  }

  const colorVal = rule.get('color')
  if (!colorVal) {
    throw new Error(`Selector "${entry.selector}" does not declare a "color" property.`)
  }

  let bgVal = rule.get('background') || rule.get('background-color')
  if ((!bgVal || bgVal === 'transparent') && entry.containerSelector) {
    const containerRule = rules.get(entry.containerSelector)
    if (containerRule) {
      bgVal = containerRule.get('background') || containerRule.get('background-color')
    }
  }
  if (!bgVal || bgVal === 'transparent') {
    bgVal = 'var(--color-white)'
  }

  const fgRgba = resolveCssValueToColor(colorVal, tokens)
  if (!fgRgba) {
    throw new Error(`Unable to resolve foreground color "${colorVal}" on selector "${entry.selector}".`)
  }

  const bgRgba = resolveCssValueToColor(bgVal, tokens)
  if (!bgRgba) {
    throw new Error(`Unable to resolve background color "${bgVal}" for selector "${entry.selector}".`)
  }

  const baseSolid = entry.baseSolid ?? [255, 255, 255]
  const bgRgb = bgRgba.a < 1 ? compositeAlphaOverSolid(bgRgba, baseSolid) : ([bgRgba.r, bgRgba.g, bgRgba.b] as [number, number, number])
  const fgRgb = fgRgba.a < 1 ? compositeAlphaOverSolid(fgRgba, bgRgb) : ([fgRgba.r, fgRgba.g, fgRgba.b] as [number, number, number])

  const ratio = contrastRatio(fgRgb, bgRgb)
  return { ratio, fgRgb, bgRgb, fgToken: colorVal, bgToken: bgVal }
}

export function measureTokenPair(
  pair: TokenContrastEntry,
  tokens: Map<string, string>,
): { ratio: number; fgRgb: [number, number, number]; bgRgb: [number, number, number] } {
  const baseSolid = pair.baseSolid ?? [255, 255, 255]
  const bgDef = resolveTokenColor(pair.bgToken, tokens)
  const bgRgb = bgDef.a < 1 ? compositeAlphaOverSolid(bgDef, baseSolid) : ([bgDef.r, bgDef.g, bgDef.b] as [number, number, number])

  const fgDef = resolveTokenColor(pair.fgToken, tokens)
  const fgRgb = fgDef.a < 1 ? compositeAlphaOverSolid(fgDef, bgRgb) : ([fgDef.r, fgDef.g, fgDef.b] as [number, number, number])

  const ratio = contrastRatio(fgRgb, bgRgb)
  return { ratio, fgRgb, bgRgb }
}

// ============================================================================
// 4. Test Suites
// ============================================================================

describe('Contrast Test 1: Bound CSS Selectors (Parsed directly from src/styles/*.css)', () => {
  const { rules, tokens } = loadAllCssRules()

  it.each(BOUND_CONTRAST_REGISTRY)('$name ($selector)', (entry) => {
    const { ratio, fgToken, bgToken } = measureBoundPair(entry, rules, tokens)
    const passed = ratio >= entry.minRatio

    if (!passed) {
      throw new Error(
        `CONTRAST FAILURE on selector "${entry.selector}": "${entry.name}" (${fgToken} on ${bgToken}) measured ratio ${ratio.toFixed(2)}:1 is below required minimum ${entry.minRatio}:1.`,
      )
    }

    expect(ratio).toBeGreaterThanOrEqual(entry.minRatio)
  })
})

describe('Contrast Test 2: Token-Only Pairs (Tokens from tokens.css)', () => {
  const tokensFilePath = path.resolve(process.cwd(), 'src/styles/tokens.css')
  const cssContent = fs.readFileSync(tokensFilePath, 'utf8')
  const tokens = parseCssTokens(cssContent)

  it.each(TOKEN_ONLY_CONTRAST_REGISTRY)('$name ($fgToken on $bgToken)', (pair) => {
    const { ratio } = measureTokenPair(pair, tokens)
    const passed = ratio >= pair.minRatio

    if (!passed) {
      throw new Error(
        `CONTRAST FAILURE: "${pair.name}" (${pair.fgToken} on ${pair.bgToken}) measured ratio ${ratio.toFixed(2)}:1 is below required minimum ${pair.minRatio}:1.`,
      )
    }

    expect(ratio).toBeGreaterThanOrEqual(pair.minRatio)
  })
})

describe('Contrast Test 3: Source Scanner for Unallowed Palette, Hex, Inline Styles & Colors', () => {
  const srcRoot = path.resolve(process.cwd(), 'src')

  const ALLOWED_HEX_FILES = new Set([
    path.normalize('src/styles/tokens.css'),
    path.normalize('src/styles/class-colors.css'),
    path.normalize('src/features/classes/classColors.ts'),
    path.normalize('src/features/classes/classColors.test.ts'),
    path.normalize('src/styles/contrast.test.ts'),
  ])

  const ALLOWED_INLINE_STYLE_FILES = new Set([
    // Dynamic ReactFlow node/edge positioning calculation for canvas label renderer
    path.normalize('src/features/canvas/components/edges/CanvasEdge.tsx'),
    path.normalize('src/features/learningCanvas/components/LearningCanvasEdge.tsx'),
    path.normalize('src/features/learningCanvas/components/QuickAddMenu.tsx'),
  ])

  const ALLOWED_COLOR_FUNC_FILES = new Set([
    path.normalize('src/styles/tokens.css'),
    path.normalize('src/styles/contrast.test.ts'),
  ])

  function getAllFiles(dir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    const files: string[] = []
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...getAllFiles(fullPath))
      } else if (entry.isFile() && /\.(tsx?|css)$/.test(entry.name)) {
        files.push(fullPath)
      }
    }
    return files
  }

  it('scans src/** and asserts no unallowed palette classes, hex colors, inline styles, or color functions exist', () => {
    const allFiles = getAllFiles(srcRoot)
    const violations: string[] = []

    const paletteRegex = /\b(?:text|bg|border)-(?:amber|emerald|red|blue|green|yellow|indigo|purple|pink|rose|slate|orange|teal|cyan|violet|fuchsia|lime)-[0-9]+/g
    const hexRegex = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g
    const inlineStyleRegex = /\bstyle\s*=\s*[{"]/ // No /g flag to avoid lastIndex bug
    const colorFuncRegex = /\b(?:rgb|hsl)a?\s*\(/i // Flag rgb(), rgba(), hsl(), hsla()

    for (const file of allFiles) {
      const relPath = path.normalize(path.relative(process.cwd(), file))
      const content = fs.readFileSync(file, 'utf8')
      const lines = content.split('\n')

      lines.forEach((line: string, idx: number) => {
        const lineNum = idx + 1

        // 1. Palette class violation
        const paletteMatches = line.match(paletteRegex)
        if (paletteMatches) {
          violations.push(
            `Hard-coded palette class "${paletteMatches.join(', ')}" at ${relPath}:${lineNum}`,
          )
        }

        // 2. Hex color violation
        if (!ALLOWED_HEX_FILES.has(relPath)) {
          const hexMatches = line.match(hexRegex)
          if (hexMatches) {
            violations.push(
              `Hard-coded hex color "${hexMatches.join(', ')}" at ${relPath}:${lineNum}`,
            )
          }
        }

        // 3. Inline style violation (without lastIndex bug)
        if (!ALLOWED_INLINE_STYLE_FILES.has(relPath)) {
          if (inlineStyleRegex.test(line)) {
            violations.push(
              `Inline style found at ${relPath}:${lineNum}`,
            )
          }
        }

        // 4. Color function violation outside tokens.css
        if (!ALLOWED_COLOR_FUNC_FILES.has(relPath)) {
          if (colorFuncRegex.test(line)) {
            violations.push(
              `Hard-coded color function found at ${relPath}:${lineNum}: "${line.trim()}"`,
            )
          }
        }
      })
    }

    if (violations.length > 0) {
      throw new Error(
        `SCANNER FAILED with ${violations.length} violations:\n` + violations.slice(0, 20).join('\n'),
      )
    }

    expect(violations).toHaveLength(0)
  })
})

describe('Contrast Test 4: Prohibition of Navy-on-Navy Pairs in Bound and Token Registries', () => {
  const { rules, tokens } = loadAllCssRules()

  function isDarkNavy(colorStr: string, tokensMap: Map<string, string>): boolean {
    const rawVal = colorStr.trim()
    const raw = rawVal.startsWith('--') ? `var(${rawVal})` : rawVal
    const darkNavyTokens = [
      '--color-navy-900',
      '--color-navy-800',
      '--color-navy-700',
      '--color-navy-900-88',
      '--color-navy-800-72',
    ]
    const varMatch = raw.match(/var\((--[a-zA-Z0-9_-]+)\)/)
    if (varMatch && darkNavyTokens.includes(varMatch[1])) {
      return true
    }
    const resolved = resolveCssValueToColor(raw, tokensMap)
    if (!resolved) return false
    // Tints (like 8%, 12%, 5%) are light backgrounds, not dark navy
    if (resolved.a < 0.6) return false
    const luminance = relativeLuminance([resolved.r, resolved.g, resolved.b])
    return luminance < 0.1 && resolved.b > resolved.r
  }

  it('fails if any bound selector rule places a dark navy element on a dark navy background', () => {
    const forbidden: string[] = []

    for (const entry of BOUND_CONTRAST_REGISTRY) {
      const rule = rules.get(entry.selector)
      if (!rule) continue

      const colorVal = rule.get('color') || ''
      let bgVal = rule.get('background') || rule.get('background-color') || ''
      if ((!bgVal || bgVal === 'transparent') && entry.containerSelector) {
        const containerRule = rules.get(entry.containerSelector)
        if (containerRule) {
          bgVal = containerRule.get('background') || containerRule.get('background-color') || ''
        }
      }

      if (isDarkNavy(colorVal, tokens) && isDarkNavy(bgVal, tokens)) {
        forbidden.push(
          `Forbidden navy-on-navy on selector "${entry.selector}": "${entry.name}" (${colorVal} on ${bgVal})`,
        )
      }
    }

    if (forbidden.length > 0) {
      throw new Error(`NAVY-ON-NAVY VIOLATIONS DETECTED IN BOUND PAIRS:\n${forbidden.join('\n')}`)
    }

    expect(forbidden).toHaveLength(0)
  })

  it('fails if any token-only pair places a dark navy element on a dark navy background', () => {
    const forbidden: string[] = []

    for (const pair of TOKEN_ONLY_CONTRAST_REGISTRY) {
      if (isDarkNavy(pair.fgToken, tokens) && isDarkNavy(pair.bgToken, tokens)) {
        forbidden.push(
          `Forbidden navy-on-navy token pair: "${pair.name}" (${pair.fgToken} on ${pair.bgToken})`,
        )
      }
    }

    if (forbidden.length > 0) {
      throw new Error(`NAVY-ON-NAVY VIOLATIONS DETECTED IN TOKEN PAIRS:\n${forbidden.join('\n')}`)
    }

    expect(forbidden).toHaveLength(0)
  })
})
