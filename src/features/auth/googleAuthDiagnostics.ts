export type GoogleAuthDiagnostic = {
  time: string
  step: string
  status: 'info' | 'success' | 'error'
  code?: string
  message?: string
}

const eventName = 'peerly:google-auth-diagnostic'

export function reportGoogleAuthDiagnostic(diagnostic: Omit<GoogleAuthDiagnostic, 'time'>): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<GoogleAuthDiagnostic>(eventName, {
    detail: { ...diagnostic, time: new Date().toISOString() },
  }))
}

export function getGoogleAuthErrorDetails(error: unknown): Pick<GoogleAuthDiagnostic, 'code' | 'message'> {
  const value = error as { code?: unknown; message?: unknown } | null
  const code = typeof value?.code === 'string' ? value.code.slice(0, 120) : undefined
  const rawMessage = typeof value?.message === 'string' ? value.message : undefined
  const message = rawMessage !== undefined
    ? describeKnownAndroidError(rawMessage)
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email hidden]')
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token hidden]')
      .replace(/\s+/g, ' ')
      .slice(0, 400)
    : undefined
  return { ...(code ? { code } : {}), ...(message ? { message } : {}) }
}

/**
 * Google Play services reports a bare status code. Code 10 (DEVELOPER_ERROR) means Google does not
 * recognise this app: the APK's package name and signing certificate (SHA-1) do not match an Android
 * OAuth client in the Firebase project. Spell that out so it is obvious what to fix.
 */
function describeKnownAndroidError(message: string): string {
  if (/^\s*10\s*:?\s*$/.test(message) || /DEVELOPER_ERROR/i.test(message)) {
    return `Google rejected this app (error 10, DEVELOPER_ERROR). The APK's package name and signing SHA-1 do not match the Android app registered in Firebase. Original: ${message.trim() || '10'}`
  }
  return message
}

export function googleAuthDiagnosticEventName(): string {
  return eventName
}
