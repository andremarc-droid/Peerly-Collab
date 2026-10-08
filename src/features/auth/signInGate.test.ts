import { describe, expect, it } from 'vitest'
import { beginSignInCheck, waitForSignInCheck } from './signInGate'

describe('signInGate', () => {
  it('resolves immediately when no check is running', async () => {
    await expect(waitForSignInCheck()).resolves.toBeUndefined()
  })

  it('holds waiters until the check ends', async () => {
    const endCheck = beginSignInCheck()
    let released = false
    const waiter = waitForSignInCheck().then(() => { released = true })
    await Promise.resolve()
    expect(released).toBe(false)
    endCheck()
    await waiter
    expect(released).toBe(true)
  })

  it('is safe to end twice and clears itself', async () => {
    const endCheck = beginSignInCheck()
    endCheck()
    endCheck()
    await expect(waitForSignInCheck()).resolves.toBeUndefined()
  })

  it('an older check ending does not release a newer one', async () => {
    const endFirst = beginSignInCheck()
    const endSecond = beginSignInCheck()
    endFirst()
    let released = false
    const waiter = waitForSignInCheck().then(() => { released = true })
    await Promise.resolve()
    expect(released).toBe(false)
    endSecond()
    await waiter
    expect(released).toBe(true)
  })
})
