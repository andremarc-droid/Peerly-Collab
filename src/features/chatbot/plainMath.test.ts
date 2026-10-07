import { describe, expect, it } from 'vitest'
import { plainMath } from './plainMath'

describe('plainMath', () => {
  it('leaves ordinary text alone', () => {
    const text = 'Binary search halves the range each step.'
    expect(plainMath(text)).toBe(text)
  })

  it('removes the dollar signs around inline math', () => {
    expect(plainMath('Start with $n$ elements.')).toBe('Start with n elements.')
  })

  it('turns the example from the chat into readable text', () => {
    expect(plainMath('Each step cuts it in half: $n/2, n/4, n/8, \\dots$')).toBe(
      'Each step cuts it in half: n/2, n/4, n/8, …',
    )
  })

  it('handles logs, powers and subscripts', () => {
    expect(plainMath('It is $O(\\log n)$.')).toBe('It is O(log n).')
    expect(plainMath('$\\log_2 n$')).toBe('log₂ n')
    expect(plainMath('$\\log_2(n)$')).toBe('log₂(n)')
    expect(plainMath('$n^2$ and $2^{10}$')).toBe('n² and 2¹⁰')
  })

  it('handles fractions, roots and comparison symbols', () => {
    expect(plainMath('$\\frac{n}{2}$')).toBe('n/2')
    expect(plainMath('$\\frac{n+1}{2}$')).toBe('(n+1)/2')
    expect(plainMath('$\\sqrt{n}$')).toBe('√n')
    expect(plainMath('$a \\leq b \\times c$')).toBe('a ≤ b × c')
  })

  it('handles block and bracket delimiters', () => {
    expect(plainMath('$$T(n) = O(\\log n)$$')).toBe('T(n) = O(log n)')
    expect(plainMath('\\( x \\times y \\)')).toBe('x × y')
    expect(plainMath('\\[ n \\geq 1 \\]')).toBe('n ≥ 1')
  })

  it('does not treat prices as math', () => {
    expect(plainMath('It costs $5 and $10 in total.')).toBe('It costs $5 and $10 in total.')
  })

  it('leaves code untouched', () => {
    expect(plainMath('Use `$x$` here.')).toBe('Use `$x$` here.')
    const block = '```\nprice = "$a$ \\dots"\n```'
    expect(plainMath(block)).toBe(block)
  })
})
