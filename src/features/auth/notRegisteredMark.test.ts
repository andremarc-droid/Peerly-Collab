import { afterEach, describe, expect, it } from 'vitest'
import {
  clearAccountNotRegisteredMark,
  hasAccountNotRegisteredMark,
  isGoogleSigninOnly,
  markAccountNotRegistered,
  setGoogleSigninOnly,
} from './notRegisteredMark'

afterEach(() => sessionStorage.clear())

describe('notRegisteredMark', () => {
  it('marks, reads and clears the not-registered result', () => {
    expect(hasAccountNotRegisteredMark()).toBe(false)
    markAccountNotRegistered()
    expect(hasAccountNotRegisteredMark()).toBe(true)
    clearAccountNotRegisteredMark()
    expect(hasAccountNotRegisteredMark()).toBe(false)
  })

  it('tracks whether a Google redirect must only accept existing accounts', () => {
    expect(isGoogleSigninOnly()).toBe(false)
    setGoogleSigninOnly(true)
    expect(isGoogleSigninOnly()).toBe(true)
    setGoogleSigninOnly(false)
    expect(isGoogleSigninOnly()).toBe(false)
  })
})
