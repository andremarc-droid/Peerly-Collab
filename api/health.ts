import type { IncomingMessage, ServerResponse } from 'http'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')

  const results: Record<string, unknown> = {
    time: new Date().toISOString(),
    node: process.version,
  }

  // 1. check service account env
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim()
    results.serviceAccountEnvPresent = !!raw
    results.serviceAccountLength = raw ? raw.length : 0
    if (raw) {
      let clean = raw
      if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
        clean = clean.slice(1, -1).trim()
      }
      const jsonStr = clean.startsWith('{') ? clean : Buffer.from(clean, 'base64').toString('utf-8')
      const parsed = JSON.parse(jsonStr) as Record<string, unknown>
      results.serviceAccountParsed = true
      results.serviceAccountProjectId = parsed.project_id
      results.serviceAccountClientEmail = parsed.client_email
      results.serviceAccountHasPrivateKey = typeof parsed.private_key === 'string' && parsed.private_key.length > 50
    }
  } catch (err: unknown) {
    results.serviceAccountError = String(err)
  }

  // 2. test importing firebase-admin
  try {
    const { getApps } = await import('firebase-admin/app')
    results.firebaseAdminImport = 'ok'
    results.existingAppsCount = getApps().length
  } catch (err: unknown) {
    results.firebaseAdminImportError = String(err)
  }

  // 3. test importing handlers
  try {
    const handlers = await import('../functions/src/groupQuizzes.js')
    results.handlersImport = 'ok'
    results.exportedHandlers = Object.keys(handlers)
  } catch (err: unknown) {
    results.handlersImportError = String(err)
  }

  res.statusCode = 200
  res.end(JSON.stringify(results, null, 2))
}
