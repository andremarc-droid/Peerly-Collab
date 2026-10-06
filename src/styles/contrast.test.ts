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
// 2. Token Registry & Measurement
// ============================================================================

export interface ContrastRegistryEntry {
  name: string
  fgToken: string
  bgToken: string
  minRatio: number // 4.5 for normal text, 3.0 for large text / UI borders / focus rings
  baseSolid?: [number, number, number]
}

export const CONTRAST_REGISTRY: ContrastRegistryEntry[] = [
  // --- Text on Surface ---
  { name: 'Navy-900 body on white canvas', fgToken: '--color-navy-900', bgToken: '--color-white', minRatio: 4.5 },
  { name: 'Navy-800 heading on white canvas', fgToken: '--color-navy-800', bgToken: '--color-white', minRatio: 4.5 },
  { name: 'Navy-800-72 supporting copy on white canvas', fgToken: '--color-navy-800-72', bgToken: '--color-white', minRatio: 4.5 },
  { name: 'Navy-900 on 5% tinted panel', fgToken: '--color-navy-900', bgToken: '--color-navy-700-05', minRatio: 4.5 },
  { name: 'Navy-800-72 on 5% tinted panel', fgToken: '--color-navy-800-72', bgToken: '--color-navy-700-05', minRatio: 4.5 },
  { name: 'White text on navy-900 surface', fgToken: '--color-white', bgToken: '--color-navy-900', minRatio: 4.5 },
  { name: 'White text on navy-800 surface', fgToken: '--color-white', bgToken: '--color-navy-800', minRatio: 4.5 },
  { name: 'White text on navy-700 surface', fgToken: '--color-white', bgToken: '--color-navy-700', minRatio: 4.5 },
  { name: 'White-72 supporting copy on navy-900', fgToken: '--color-white-72', bgToken: '--color-navy-900', minRatio: 4.5 },
  { name: 'White-55 meta on navy-900', fgToken: '--color-white-55', bgToken: '--color-navy-900', minRatio: 4.5 },

  // --- Button Variant Labels on Fill ---
  { name: 'Button primary on light (white text on navy-800)', fgToken: '--color-white', bgToken: '--color-navy-800', minRatio: 4.5 },
  { name: 'Button secondary on light (navy-900 text on white fill)', fgToken: '--color-navy-900', bgToken: '--color-white', minRatio: 4.5 },
  { name: 'Button tertiary on light (navy-900 text on white fill)', fgToken: '--color-navy-900', bgToken: '--color-white', minRatio: 4.5 },
  { name: 'Button primary on navy (navy-900 text on white fill)', fgToken: '--color-navy-900', bgToken: '--color-white', minRatio: 4.5 },
  { name: 'Button secondary on navy (white text on navy-900 fill)', fgToken: '--color-white', bgToken: '--color-navy-900', minRatio: 4.5 },
  { name: 'Button destructive primary (white text on danger fill)', fgToken: '--color-white', bgToken: '--color-danger', minRatio: 4.5 },
  { name: 'Button destructive secondary (danger-text on white fill)', fgToken: '--color-danger-text', bgToken: '--color-white', minRatio: 4.5 },

  // --- Tab Label on Canvas (Inactive / Hover / Selected) ---
  { name: 'Tab inactive label on white canvas', fgToken: '--color-navy-800-72', bgToken: '--color-white', minRatio: 4.5 },
  { name: 'Tab inactive label on tablist background', fgToken: '--color-navy-800-72', bgToken: '--color-navy-900-08', minRatio: 4.5 },
  { name: 'Tab hover label on tablist hover fill', fgToken: '--color-navy-900', bgToken: '--color-navy-900-12', minRatio: 4.5 },
  { name: 'Tab selected label on navy-800 fill', fgToken: '--color-white', bgToken: '--color-navy-800', minRatio: 4.5 },
  { name: 'Tab inactive count badge (navy-900 text on navy-900-12 fill)', fgToken: '--color-navy-900', bgToken: '--color-navy-900-12', minRatio: 4.5 },
  { name: 'Tab selected count badge (navy-900 text on white fill)', fgToken: '--color-navy-900', bgToken: '--color-white', minRatio: 4.5 },

  // --- Badge Text on Badge Fill ---
  { name: 'Badge on light surface (navy-800 on white fill)', fgToken: '--color-navy-800', bgToken: '--color-white', minRatio: 4.5 },
  { name: 'Badge on navy surface (white on navy-700 fill)', fgToken: '--color-white', bgToken: '--color-navy-700', minRatio: 4.5 },

  // --- Alert Text on Neutral White Background ---
  { name: 'Alert title on neutral white card', fgToken: '--color-navy-900', bgToken: '--color-white', minRatio: 4.5 },
  { name: 'Alert body copy on neutral white card', fgToken: '--color-navy-800-72', bgToken: '--color-white', minRatio: 4.5 },

  // --- Status Text on Status Tint ---
  { name: 'Feedback success text on success surface', fgToken: '--color-feedback-success', bgToken: '--color-feedback-success-bg', minRatio: 4.5 },
  { name: 'Feedback warning text on warning surface', fgToken: '--color-feedback-warning', bgToken: '--color-feedback-warning-bg', minRatio: 4.5 },
  { name: 'Feedback error text on error surface', fgToken: '--color-feedback-error', bgToken: '--color-feedback-error-bg', minRatio: 4.5 },
  { name: 'Danger text on danger background', fgToken: '--color-danger-text', bgToken: '--color-danger-bg', minRatio: 4.5 },

  // --- Focus Rings on Canvas and on Navy ---
  { name: 'Focus ring on white canvas', fgToken: '--color-navy-700', bgToken: '--color-white', minRatio: 3.0 },
  { name: 'Focus ring on tinted canvas', fgToken: '--color-navy-700', bgToken: '--color-navy-700-05', minRatio: 3.0 },
  { name: 'Focus ring on navy surface', fgToken: '--color-white', bgToken: '--color-navy-900', minRatio: 3.0 },

  // --- Borders ---
  { name: 'Button secondary outline on navy', fgToken: '--color-white', bgToken: '--color-navy-900', minRatio: 3.0 },
  { name: 'Active control border on white', fgToken: '--color-navy-800', bgToken: '--color-white', minRatio: 3.0 },
  { name: 'Alert left accent bar: success', fgToken: '--color-feedback-success', bgToken: '--color-white', minRatio: 3.0 },
  { name: 'Alert left accent bar: error', fgToken: '--color-feedback-error', bgToken: '--color-white', minRatio: 3.0 },
  { name: 'Alert left accent bar: warning', fgToken: '--color-feedback-warning', bgToken: '--color-white', minRatio: 3.0 },
  { name: 'Alert left accent bar: info', fgToken: '--color-navy-800', bgToken: '--color-white', minRatio: 3.0 },
  { name: 'Danger border on danger bg', fgToken: '--color-danger', bgToken: '--color-danger-bg', minRatio: 3.0 },

  // --- Canvas and Module Pairs ---
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
  { name: 'Module card title on white', fgToken: '--color-navy-900', bgToken: '--color-white', minRatio: 4.5 },
  { name: 'Module card meta on white', fgToken: '--color-navy-800-72', bgToken: '--color-white', minRatio: 4.5 },
  { name: 'Module publish bar title on navy-900', fgToken: '--color-white', bgToken: '--color-navy-900', minRatio: 4.5 },
  { name: 'Module publish bar copy on navy-900', fgToken: '--color-white-72', bgToken: '--color-navy-900', minRatio: 4.5 },
  { name: 'Resource embed fallback text on white', fgToken: '--color-navy-800-72', bgToken: '--color-white', minRatio: 4.5 },
  { name: 'Resource embed fallback link on white', fgToken: '--color-navy-800', bgToken: '--color-white', minRatio: 4.5 },
]

export function measurePair(
  pair: ContrastRegistryEntry,
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
// 3. Test Suites
// ============================================================================

describe('Contrast Test 1: Registry of Token Pairs (Parsed from tokens.css)', () => {
  const tokensFilePath = path.resolve(process.cwd(), 'src/styles/tokens.css')
  const cssContent = fs.readFileSync(tokensFilePath, 'utf8')
  const tokens = parseCssTokens(cssContent)

  it.each(CONTRAST_REGISTRY)('$name ($fgToken on $bgToken)', (pair) => {
    const { ratio } = measurePair(pair, tokens)
    const passed = ratio >= pair.minRatio

    if (!passed) {
      throw new Error(
        `CONTRAST FAILURE: "${pair.name}" (${pair.fgToken} on ${pair.bgToken}) measured ratio ${ratio.toFixed(2)}:1 is below required minimum ${pair.minRatio}:1.`,
      )
    }

    expect(ratio).toBeGreaterThanOrEqual(pair.minRatio)
  })
})

describe('Contrast Test 2: Source Scanner for Unallowed Hard-Coded Palette, Hex & Inline Styles', () => {
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

  it('scans src/** and asserts no unallowed palette classes, hex colors, or inline styles exist', () => {
    const allFiles = getAllFiles(srcRoot)
    const violations: string[] = []

    const paletteRegex = /\b(?:text|bg|border)-(?:amber|emerald|red|blue|green|yellow|indigo|purple|pink|rose|slate|orange|teal|cyan|violet|fuchsia|lime)-[0-9]+/g
    const hexRegex = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g
    const inlineStyleRegex = /\bstyle\s*=\s*[{"]/g

    for (const file of allFiles) {
      const relPath = path.normalize(path.relative(process.cwd(), file))

      // Skip landing page or test files if needed, but let's check everything in src
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

        // 3. Inline style violation
        if (!ALLOWED_INLINE_STYLE_FILES.has(relPath)) {
          if (inlineStyleRegex.test(line)) {
            violations.push(
              `Inline style found at ${relPath}:${lineNum}`,
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

describe('Contrast Test 3: Prohibition of Navy-on-Navy Pairs in Registry', () => {
  function isDarkNavyToken(token: string): boolean {
    const darkNavyTokens = [
      '--color-navy-900',
      '--color-navy-800',
      '--color-navy-700',
      '--color-navy-900-88',
      '--color-navy-800-72',
    ]
    return darkNavyTokens.includes(token)
  }

  it('fails if any registered pair places a navy element/text on a dark navy background', () => {
    const forbidden: string[] = []

    for (const pair of CONTRAST_REGISTRY) {
      const isFgNavy = isDarkNavyToken(pair.fgToken)
      const isBgNavy = isDarkNavyToken(pair.bgToken)

      if (isFgNavy && isBgNavy) {
        forbidden.push(
          `Forbidden navy-on-navy pair: "${pair.name}" (${pair.fgToken} on ${pair.bgToken})`,
        )
      }
    }

    if (forbidden.length > 0) {
      throw new Error(
        `NAVY-ON-NAVY VIOLATIONS DETECTED:\n${forbidden.join('\n')}`,
      )
    }

    expect(forbidden).toHaveLength(0)
  })
})
