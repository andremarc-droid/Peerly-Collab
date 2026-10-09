export const GOOGLE_CLIENT_ID_VAR = 'VITE_GOOGLE_CLIENT_ID'
export const GOOGLE_API_KEY_VAR = 'VITE_GOOGLE_API_KEY'
export const GOOGLE_APP_ID_VAR = 'VITE_GOOGLE_APP_ID'

export interface DriveConfig {
  clientId: string
  apiKey: string
  appId: string
}

export type EnvSource = Record<string, string | undefined>

/** All three values are required. The error names every missing variable so setup is one pass. */
export function validateDriveEnv(env: EnvSource): DriveConfig {
  const values = {
    [GOOGLE_CLIENT_ID_VAR]: env[GOOGLE_CLIENT_ID_VAR]?.trim(),
    [GOOGLE_API_KEY_VAR]: env[GOOGLE_API_KEY_VAR]?.trim(),
    [GOOGLE_APP_ID_VAR]: env[GOOGLE_APP_ID_VAR]?.trim(),
  }
  const missing = Object.entries(values).filter(([, value]) => !value).map(([name]) => name)
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables for Google Drive: ${missing.join(', ')}. Add them to .env.local and restart the dev server (see docs/google-drive-setup.md).`)
  }
  return { clientId: values[GOOGLE_CLIENT_ID_VAR]!, apiKey: values[GOOGLE_API_KEY_VAR]!, appId: values[GOOGLE_APP_ID_VAR]! }
}

/** Evaluated lazily so missing Google settings disable file features instead of crashing the whole app. */
export function getDriveConfig(env: EnvSource = import.meta.env): DriveConfig {
  return validateDriveEnv(env)
}

/** A plain-language problem description, or null when Google Drive is configured. */
export function getDriveConfigIssue(env: EnvSource = import.meta.env): string | null {
  try {
    getDriveConfig(env)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : 'Google Drive is not configured.'
  }
}
