import { beforeEach, describe, expect, it } from 'vitest'
import { readRoleIntent, ROLE_INTENT_STORAGE_KEY, saveRoleIntent } from './roleIntent'

describe('role intent session storage', () => {
  beforeEach(() => sessionStorage.clear())

  it('persists and reads a typed role intent', () => {
    saveRoleIntent({ role: 'student', mode: 'signup' })
    expect(sessionStorage.getItem(ROLE_INTENT_STORAGE_KEY)).toBe('{"role":"student","mode":"signup"}')
    expect(readRoleIntent()).toEqual({ role: 'student', mode: 'signup' })
  })

  it('clears malformed or unsupported data', () => {
    sessionStorage.setItem(ROLE_INTENT_STORAGE_KEY, '{bad json')
    expect(readRoleIntent()).toBeNull()
    expect(sessionStorage.getItem(ROLE_INTENT_STORAGE_KEY)).toBeNull()
  })
})
