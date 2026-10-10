import { describe, expect, it, vi } from 'vitest'
import { AiError, aiComplete, aiJson, extractJson } from './ai'

describe('study engine AI wrapper', () => {
  it('extracts fenced and surrounded JSON', () => {
    expect(extractJson('```json\n{"ok":true}\n```')).toEqual({ ok: true })
    expect(extractJson('Here: {"ok":true} thanks')).toEqual({ ok: true })
  })

  it('retries unusable JSON once and never retries rate limits', async () => {
    const complete = vi.fn().mockResolvedValueOnce('not json').mockResolvedValueOnce('{"value":2}')
    await expect(aiJson('make json', (value) => typeof value === 'object' && value !== null && 'value' in value ? value : null, { complete })).resolves.toEqual({ value: 2 })
    expect(complete).toHaveBeenCalledTimes(2)
    const rate = vi.fn().mockRejectedValue(new AiError('rate-limit', 'busy'))
    await expect(aiJson('make json', () => null, { complete: rate })).rejects.toMatchObject({ reason: 'rate-limit' })
    expect(rate).toHaveBeenCalledTimes(1)
  })

  it('passes AbortError through unchanged', async () => {
    const abort = new DOMException('Stopped', 'AbortError')
    await expect(aiComplete('prompt', { complete: async () => { throw abort } })).rejects.toBe(abort)
  })
})
