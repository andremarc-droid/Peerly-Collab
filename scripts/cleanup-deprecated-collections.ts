import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

export const DEPRECATED_ROOT_COLLECTIONS = [
  'games',
  'gamePlayerSessions',
  'gameHosts',
  'gameCodes',
  'groups',
  'youtubeTranscriptRateLimits',
] as const

export interface CleanupDeprecatedOptions {
  projectId?: string
  apply?: boolean
  allowProduction?: boolean
  db?: Firestore
}

export interface CleanupReport {
  dryRun: boolean
  isEmulator: boolean
  projectId: string
  countsByCollection: Record<string, number>
  totalDocumentsDeleted: number
}

export function isEmulatorEnvironment(projectId: string): boolean {
  if (process.env.FIRESTORE_EMULATOR_HOST) return true
  if (projectId.startsWith('demo-')) return true
  return false
}

export function validateEnvironment(projectId: string, allowProduction: boolean): boolean {
  const isEmulator = isEmulatorEnvironment(projectId)
  if (!isEmulator && !allowProduction) {
    throw new Error(
      `Refusing to run against non-emulator environment (${projectId}) without --i-understand-this-is-production flag.`,
    )
  }
  return isEmulator
}

export async function cleanupDeprecatedCollections(
  options: CleanupDeprecatedOptions = {},
): Promise<CleanupReport> {
  const projectId =
    options.projectId ??
    process.env.GCLOUD_PROJECT ??
    process.env.FIREBASE_CONFIG_PROJECT_ID ??
    'demo-peerly-collab'
  const apply = options.apply ?? false
  const allowProduction = options.allowProduction ?? false

  const isEmulator = validateEnvironment(projectId, allowProduction)

  let db = options.db
  if (!db) {
    if (getApps().length === 0) {
      initializeApp({ projectId })
    }
    db = getFirestore()
  }

  const countsByCollection: Record<string, number> = {}
  let totalDocumentsDeleted = 0

  for (const collectionName of DEPRECATED_ROOT_COLLECTIONS) {
    const colRef = db.collection(collectionName)
    const snapshot = await colRef.get()
    countsByCollection[collectionName] = snapshot.size

    if (apply && snapshot.size > 0) {
      for (const doc of snapshot.docs) {
        await db.recursiveDelete(doc.ref)
        totalDocumentsDeleted += 1
      }
    }
  }

  return {
    dryRun: !apply,
    isEmulator,
    projectId,
    countsByCollection,
    totalDocumentsDeleted: apply ? totalDocumentsDeleted : 0,
  }
}

if (process.argv[1]?.endsWith('cleanup-deprecated-collections.ts')) {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const allowProduction = args.includes('--i-understand-this-is-production')

  void cleanupDeprecatedCollections({ apply, allowProduction }).then(report => {
    console.log(JSON.stringify(report, null, 2))
  })
}
