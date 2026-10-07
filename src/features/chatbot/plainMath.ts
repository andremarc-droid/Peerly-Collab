/**
 * The tutor sometimes writes math as LaTeX ($n$, \dots, \frac{a}{b}), but chat replies are shown as plain Markdown.
 * `plainMath` rewrites that notation as readable text (n, …, a/b) and leaves code untouched.
 */

const SYMBOLS: Record<string, string> = {
  dots: '…', ldots: '…', cdots: '…', times: '×', cdot: '·', div: '÷', pm: '±',
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', infty: '∞',
  to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', Leftarrow: '⇐',
  pi: 'π', theta: 'θ', Theta: 'Θ', Omega: 'Ω', omega: 'ω', alpha: 'α', beta: 'β',
  lambda: 'λ', mu: 'μ', sigma: 'σ', Sigma: 'Σ', sum: 'Σ',
  lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', quad: ' ', qquad: ' ',
  log: 'log', ln: 'ln', lg: 'lg', min: 'min', max: 'max', sin: 'sin', cos: 'cos', tan: 'tan',
}

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '+': '⁺',
}

const SUBSCRIPT: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
}

function mapAll(value: string, table: Record<string, string>): string | null {
  let result = ''
  for (const char of value) {
    const mapped = table[char]
    if (!mapped) return null
    result += mapped
  }
  return result
}

function wrap(value: string): string {
  const trimmed = value.trim()
  return /^[\w.]+$/.test(trimmed) ? trimmed : `(${trimmed})`
}

function convertMath(math: string): string {
  let text = math

  text = text.replace(/\\(?:text|textbf|mathrm|mathbf|mathit|mathcal|operatorname)\{([^{}]*)\}/g, '$1')
  for (let pass = 0; pass < 3; pass += 1) {
    text = text.replace(/\\d?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_match, top: string, bottom: string) => `${wrap(top)}/${wrap(bottom)}`)
  }
  text = text.replace(/\\sqrt\{([^{}]*)\}/g, (_match, inner: string) => `√${wrap(inner)}`)

  text = text.replace(/\^\{([^{}]*)\}/g, (_match, inner: string) => mapAll(inner, SUPERSCRIPT) ?? `^${wrap(inner)}`)
  text = text.replace(/\^(\d)/g, (_match, digit: string) => SUPERSCRIPT[digit])
  text = text.replace(/_\{([^{}]*)\}/g, (_match, inner: string) => mapAll(inner, SUBSCRIPT) ?? `_${inner}`)
  text = text.replace(/_(\d)/g, (_match, digit: string) => SUBSCRIPT[digit])

  text = text.replace(/\\(?:left|right)\b\s?/g, '')
  text = text.replace(/\\([A-Za-z]+)/g, (_match, name: string) => SYMBOLS[name] ?? name)
  text = text.replace(/\\[,;:! ]/g, ' ')
  text = text.replace(/[{}]/g, '')

  return text.replace(/[ \t]{2,}/g, ' ').trim()
}

const CODE = /(```[\s\S]*?```|`[^`\n]*`)/

/** Rewrites LaTeX math in a reply as plain text. Code blocks and currency like "$5 and $10" are left alone. */
export function plainMath(text: string): string {
  if (!text.includes('$') && !text.includes('\\')) return text

  return text
    .split(CODE)
    .map((part, index) => {
      if (index % 2 === 1) return part
      return part
        .replace(/\$\$([\s\S]+?)\$\$/g, (_match, math: string) => convertMath(math))
        .replace(/\\\[([\s\S]+?)\\\]/g, (_match, math: string) => convertMath(math))
        .replace(/\\\(([\s\S]+?)\\\)/g, (_match, math: string) => convertMath(math))
        .replace(/(?<!\\)\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/g, (_match, math: string) => convertMath(math))
    })
    .join('')
}
