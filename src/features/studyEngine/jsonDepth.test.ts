import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiError, aiComplete, aiJson, exceedsJsonDepth, extractJson } from './ai'

afterEach(() => vi.restoreAllMocks())

describe('exceedsJsonDepth', () => {
  it('flags absurdly nested replies quickly and leaves normal JSON alone', () => {
    expect(exceedsJsonDepth('['.repeat(100_000))).toBe(true)
    expect(exceedsJsonDepth('{"a":[1,{"b":[2,3]}]}')).toBe(false)
  })

  it('ignores brackets that are only text inside strings', () => {
    expect(exceedsJsonDepth(`{"note":"${'['.repeat(500)}","quote":"say \\"[[[[\\" twice"}`)).toBe(false)
  })

  it('respects a custom limit', () => {
    expect(exceedsJsonDepth('[[[1]]]', 2)).toBe(true)
    expect(exceedsJsonDepth('[[[1]]]', 3)).toBe(false)
  })
})

describe('extractJson', () => {
  it('still reads fenced and surrounded JSON', () => {
    expect(extractJson('```json\n{"a":[1,2]}\n```')).toEqual({ a: [1, 2] })
    expect(extractJson('Here you go: {"a":1} Enjoy.')).toEqual({ a: 1 })
  })

  it('rejects over-nested replies with a clear SyntaxError instead of parsing them', () => {
    expect(() => extractJson('['.repeat(100_000) + ']'.repeat(100_000))).toThrow(/nested too deeply/)
  })
})

describe('stack-overflow style errors', () => {
  it('never shows "Maximum call stack size exceeded" for a failure inside the reply parser', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const parse = () => { throw new RangeError('Maximum call stack size exceeded') }
    const failure = await aiJson('prompt', parse, { complete: async () => '{"a":1}' }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(AiError)
    expect((failure as AiError).message).toBe('The AI reply could not be read. Try again.')
    expect(log).toHaveBeenCalled()
  })

  it('does the same when the AI call itself throws one, and logs the real error for debugging', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const failure = await aiComplete('prompt', { complete: async () => { throw new RangeError('Maximum call stack size exceeded') } }).catch((error: unknown) => error)

    expect((failure as AiError).message).toBe('The AI reply could not be read. Try again.')
    expect(log.mock.calls[0]?.[1]).toBeInstanceOf(RangeError)
  })

  it('keeps ordinary error messages unchanged', async () => {
    const failure = await aiComplete('prompt', { complete: async () => { throw new Error('Network down') } }).catch((error: unknown) => error)
    expect((failure as AiError).message).toBe('Network down')
  })
})
