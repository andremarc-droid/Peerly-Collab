import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

export const CANVAS_SUBCOLLECTIONS = [
  'questions',
  'answerKeys',
  'images',
  'attempts',
  'results',
  'participants',
  'teams',
  'teamSessions',
  'teamBoards',
  'teamPrivate',
  'teamCodes',
  'teamMeta',
] as const

export interface RemoveCanvasQuizzesOptions {
  projectId?: string
  apply?: boolean
  allowProduction?: boolean
  db?: Firestore
}

export interface QuizDeletionSummary {
  id: string
  title: string
  subcollections: Record<string, number>
  totalSubDocs: number
}

export interface RemoveCanvasQuizzesReport {
  dryRun: boolean
  isEmulator: boolean
  projectId: string
  canvasQuizzesFound: number
  quizzes: QuizDeletionSummary[]
  totalQuizzesDeleted: number
  totalSubDocsDeleted: number
}

export function isEmulatorEnvironment(projectId: string): boolean {
  if (Boolean(process.env.FIRESTORE_EMULATOR_HOST)) return true
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

export async function removeCanvasQuizzes(
  options: RemoveCanvasQuizzesOptions = {},
): Promise<RemoveCanvasQuizzesReport> {
  const projectId =
    options.projectId ||
    process.env.GCLOUD_PROJECT ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    'demo-peerly-collab'
  const allowProduction = options.allowProduction ?? false
  const apply = options.apply ?? false

  const isEmulator = validateEnvironment(projectId, allowProduction)

  let db = options.db
  if (!db) {
    if (getApps().length === 0) {
      initializeApp({ projectId })
    }
    db = getFirestore()
  }

  const quizzesRef = db.collection('quizzes')
  const [byModeSnap, byTypeSnap] = await Promise.all([
    quizzesRef.where('mode', '==', 'canvas').get(),
    quizzesRef.where('type', '==', 'canvas').get(),
  ])

  const docMap = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>()
  for (const doc of byModeSnap.docs) docMap.set(doc.id, doc)
  for (const doc of byTypeSnap.docs) docMap.set(doc.id, doc)

  const quizSummaries: QuizDeletionSummary[] = []
  let totalSubDocsCount = 0

  for (const [quizId, docSnap] of docMap.entries()) {
    const data = docSnap.data()
    const title = (data?.title as string) || '(untitled)'
    const subCounts: Record<string, number> = {}
    let quizSubDocs = 0

    const subDocsToDelete: FirebaseFirestore.DocumentReference[] = []

    for (const subcol of CANVAS_SUBCOLLECTIONS) {
      const subSnap = await docSnap.ref.collection(subcol).get()
      subCounts[subcol] = subSnap.size
      quizSubDocs += subSnap.size
      if (apply && subSnap.size > 0) {
        for (const subDoc of subSnap.docs) {
          subDocsToDelete.push(subDoc.ref)
        }
      }
    }

    quizSummaries.push({
      id: quizId,
      title,
      subcollections: subCounts,
      totalSubDocs: quizSubDocs,
    })
    totalSubDocsCount += quizSubDocs

    if (apply) {
      const BATCH_SIZE = 400
      for (let i = 0; i < subDocsToDelete.length; i += BATCH_SIZE) {
        const batch = db.batch()
        const slice = subDocsToDelete.slice(i, i + BATCH_SIZE)
        for (const ref of slice) {
          batch.delete(ref)
        }
        await batch.commit()
      }
      await docSnap.ref.delete()
    }
  }

  return {
    dryRun: !apply,
    isEmulator,
    projectId,
    canvasQuizzesFound: docMap.size,
    quizzes: quizSummaries,
    totalQuizzesDeleted: apply ? docMap.size : 0,
    totalSubDocsDeleted: apply ? totalSubDocsCount : 0,
  }
}

if (process.argv[1] && /remove-canvas-quizzes(\.ts|\.js)?$/.test(process.argv[1])) {
  const isApply = process.argv.includes('--apply')
  const allowProduction = process.argv.includes('--i-understand-this-is-production')
  const projectId = process.argv.find((arg) => arg.startsWith('--project='))?.split('=')[1]

  removeCanvasQuizzes({ apply: isApply, allowProduction, projectId })
    .then((report) => {
      console.log('--- Canvas Quizzes Removal Report ---')
      console.log(`Mode: ${report.dryRun ? 'DRY RUN (no changes made)' : 'APPLY (changes made)'}`)
      console.log(`Project: ${report.projectId} (emulator: ${report.isEmulator})`)
      console.log(`Canvas quizzes found: ${report.canvasQuizzesFound}`)
      for (const q of report.quizzes) {
        console.log(`- Quiz [${q.id}] "${q.title}": ${q.totalSubDocs} sub-documents`)
        for (const [sub, count] of Object.entries(q.subcollections)) {
          if (count > 0) console.log(`    ${sub}: ${count}`)
        }
      }
      if (report.dryRun) {
        console.log(
          `Summary: ${report.canvasQuizzesFound} quizzes and ${report.quizzes.reduce((acc, q) => acc + q.totalSubDocs, 0)} subcollection documents would be deleted. Run with --apply to delete.`,
        )
      } else {
        console.log(
          `Summary: Successfully deleted ${report.totalQuizzesDeleted} quizzes and ${report.totalSubDocsDeleted} subcollection documents.`,
        )
      }
    })
    .catch((err: Error) => {
      console.error('Error running remove-canvas-quizzes:', err.message)
      process.exit(1)
    })
}
