/**
 * A sign-in-only Google attempt (Sign in page) can create a brand-new Firebase account before we
 * know whether the person was registered. While that check is running, AuthProvider must not create
 * a profile for the signed-in user, or the unregistered person would be registered by accident.
 */
let pending: Promise<void> | null = null

/** Starts a check and returns a function that ends it. Safe to call more than once. */
export function beginSignInCheck(): () => void {
  let release: () => void = () => {}
  const current = new Promise<void>((resolve) => { release = resolve })
  pending = current
  return () => {
    release()
    if (pending === current) pending = null
  }
}

/** Resolves immediately when no check is running. */
export function waitForSignInCheck(): Promise<void> {
  return pending ?? Promise.resolve()
}
