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
  const message = typeof value?.message === 'string'
    ? value.message
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email hidden]')
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token hidden]')
      .replace(/\s+/g, ' ')
      .slice(0, 400)
    : undefined
  return { ...(code ? { code } : {}), ...(message ? { message } : {}) }
}

export function googleAuthDiagnosticEventName(): string {
  return eventName
}
