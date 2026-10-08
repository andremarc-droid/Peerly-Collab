import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  setCustomParameters: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  getAdditionalUserInfo: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('../../lib/firebase/auth', () => ({ auth: {} }))
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {
    setCustomParameters = mocks.setCustomParameters
  },
  signInWithPopup: mocks.signInWithPopup,
  signInWithRedirect: mocks.signInWithRedirect,
  getAdditionalUserInfo: mocks.getAdditionalUserInfo,
  signOut: mocks.signOut,
  browserLocalPersistence: {},
  createUserWithEmailAndPassword: vi.fn(),
  deleteUser: vi.fn(),
  EmailAuthProvider: { credential: vi.fn() },
  getRedirectResult: vi.fn(),
  onAuthStateChanged: vi.fn(),
  reauthenticateWithCredential: vi.fn(),
  reauthenticateWithPopup: vi.fn(),
  reload: vi.fn(),
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  setPersistence: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  updateProfile: vi.fn(),
}))

import { signInWithGoogle } from './authService'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getAdditionalUserInfo.mockReturnValue({ isNewUser: false })
  mocks.signInWithPopup.mockResolvedValue({ user: { uid: 'user-1' } })
})

afterEach(() => {
  sessionStorage.clear()
})

describe('Google account selection', () => {
  it('asks Google to show the account chooser for popup sign-in', async () => {
    await signInWithGoogle({ requireExistingAccount: true })

    expect(mocks.setCustomParameters).toHaveBeenCalledWith({ prompt: 'select_account' })
    expect(mocks.signInWithPopup).toHaveBeenCalledOnce()
  })

  it('keeps the account chooser prompt for redirect fallback', async () => {
    mocks.signInWithPopup.mockRejectedValue({ code: 'auth/popup-blocked' })

    await signInWithGoogle({ requireExistingAccount: true })

    expect(mocks.setCustomParameters).toHaveBeenCalledWith({ prompt: 'select_account' })
    expect(mocks.signInWithRedirect).toHaveBeenCalledOnce()
  })
})
