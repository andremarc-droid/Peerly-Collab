export const NOT_REGISTERED_STORAGE_KEY = 'peerly:accountNotRegistered'
export const GOOGLE_SIGNIN_ONLY_STORAGE_KEY = 'peerly:googleSigninOnly'

/** Remembers that a redirect-based Google sign-in was rejected, so the Sign in page can explain why. */
export function markAccountNotRegistered(storage: Storage = window.sessionStorage): void {
  storage.setItem(NOT_REGISTERED_STORAGE_KEY, '1')
}

export function hasAccountNotRegisteredMark(storage: Storage = window.sessionStorage): boolean {
  return storage.getItem(NOT_REGISTERED_STORAGE_KEY) === '1'
}

export function clearAccountNotRegisteredMark(storage: Storage = window.sessionStorage): void {
  storage.removeItem(NOT_REGISTERED_STORAGE_KEY)
}

/** A Google redirect started from the Sign in page must only accept accounts that already exist. */
export function setGoogleSigninOnly(enabled: boolean, storage: Storage = window.sessionStorage): void {
  if (enabled) storage.setItem(GOOGLE_SIGNIN_ONLY_STORAGE_KEY, '1')
  else storage.removeItem(GOOGLE_SIGNIN_ONLY_STORAGE_KEY)
}

export function isGoogleSigninOnly(storage: Storage = window.sessionStorage): boolean {
  return storage.getItem(GOOGLE_SIGNIN_ONLY_STORAGE_KEY) === '1'
}
