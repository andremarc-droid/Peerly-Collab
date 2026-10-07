import {
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  Timestamp,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { firestore } from '../../lib/firebase/firestore'
import {
  MAX_CANVAS_TITLE_LENGTH,
} from './constants'
import {
  learningCanvasContentRef,
  learningCanvasRef,
  learningCanvasesRef,
} from './paths'
import {
  computeRefs,
  countStats,
  parseLearningCanvasContent,
  parseLearningCanvasMetadata,
} from './schemas'
import type {
  CreateLearningCanvasInput,
  LearningCanvasContent,
  LearningCanvasRecord,
  LearningCanvasWithId,
} from './types'

export async function getCanvas(
  classId: string,
  canvasId: string,
  db: Firestore = firestore,
): Promise<LearningCanvasWithId | null> {
  const snap = await getDoc(learningCanvasRef(db, classId, canvasId))
  if (!snap.exists()) return null
  return { ...parseLearningCanvasMetadata(snap.data()), id: snap.id }
}

export async function getContent(
  classId: string,
  canvasId: string,
  db: Firestore = firestore,
): Promise<LearningCanvasContent | null> {
  const snap = await getDoc(learningCanvasContentRef(db, classId, canvasId))
  if (!snap.exists()) return null
  return parseLearningCanvasContent(snap.data())
}

export function watchClassCanvases(
  classId: string,
  role: 'instructor' | 'student',
  onChange: (canvases: LearningCanvasWithId[]) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  const base = learningCanvasesRef(db, classId)
  const q =
    role === 'student'
      ? query(base, where('kind', '==', 'class'), where('status', '==', 'published'), orderBy('updatedAt', 'desc'))
      : query(base, where('kind', '==', 'class'), orderBy('updatedAt', 'desc'))

  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({
        ...parseLearningCanvasMetadata(d.data()),
        id: d.id,
      }))
      onChange(items)
    },
    onError,
  )
}

export function watchMyCanvases(
  classId: string,
  uid: string,
  onChange: (canvases: LearningCanvasWithId[]) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  const base = learningCanvasesRef(db, classId)
  const q = query(
    base,
    where('kind', '==', 'personal'),
    where('ownerId', '==', uid),
    orderBy('updatedAt', 'desc'),
  )

  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({
        ...parseLearningCanvasMetadata(d.data()),
        id: d.id,
      }))
      onChange(items)
    },
    onError,
  )
}

export async function createCanvas(
  classId: string,
  ownerId: string,
  input: CreateLearningCanvasInput,
  db: Firestore = firestore,
): Promise<string> {
  const ref = doc(learningCanvasesRef(db, classId))
  const contentRef = learningCanvasContentRef(db, classId, ref.id)
  const now = Timestamp.now()

  const initialContent: LearningCanvasContent = {
    version: 1,
    nodes: input.initialContent?.nodes ?? [],
    edges: input.initialContent?.edges ?? [],
    viewport: input.initialContent?.viewport ?? { x: 0, y: 0, zoom: 1 },
  }
  const parsedContent = parseLearningCanvasContent(initialContent)
  const refs = computeRefs(parsedContent.nodes)
  const stats = countStats(parsedContent.nodes, parsedContent.edges)

  const meta: LearningCanvasRecord = {
    ownerId,
    classId,
    kind: input.kind,
    title: input.title.trim().slice(0, MAX_CANVAS_TITLE_LENGTH) || 'Untitled canvas',
    description: (input.description ?? '').slice(0, 300),
    status: input.kind === 'personal' ? 'private' : 'draft',
    nodeCount: stats.nodeCount,
    edgeCount: stats.edgeCount,
    refs,
    sourceCanvasId: input.sourceCanvasId ?? null,
    createdAt: now,
    updatedAt: now,
  }
  const parsedMeta = parseLearningCanvasMetadata(meta)

  const batch = writeBatch(db)
  batch.set(ref, parsedMeta)
  batch.set(contentRef, parsedContent)
  await batch.commit()

  return ref.id
}

export async function saveCanvas(
  classId: string,
  canvasId: string,
  content: LearningCanvasContent,
  expectedUpdatedAt: Timestamp,
  patchMeta?: { title?: string; description?: string },
  db: Firestore = firestore,
): Promise<void> {
  const parsedContent = parseLearningCanvasContent(content)
  const refs = computeRefs(parsedContent.nodes)
  const stats = countStats(parsedContent.nodes, parsedContent.edges)

  await runTransaction(db, async (tx) => {
    const parentRef = learningCanvasRef(db, classId, canvasId)
    const contentRef = learningCanvasContentRef(db, classId, canvasId)

    const parentSnap = await tx.get(parentRef)
    if (!parentSnap.exists()) {
      throw new Error('Canvas not found.')
    }

    const existing = parseLearningCanvasMetadata(parentSnap.data())
    if (existing.updatedAt.toMillis() !== expectedUpdatedAt.toMillis()) {
      throw new Error('Canvas has been modified by another session. Please reload to see the latest changes.')
    }

    const now = Timestamp.now()
    const title = patchMeta?.title !== undefined ? patchMeta.title.trim().slice(0, MAX_CANVAS_TITLE_LENGTH) : existing.title
    const description = patchMeta?.description !== undefined ? patchMeta.description.slice(0, 300) : existing.description

    const nextMeta: LearningCanvasRecord = {
      ...existing,
      title: title || 'Untitled canvas',
      description,
      nodeCount: stats.nodeCount,
      edgeCount: stats.edgeCount,
      refs,
      updatedAt: now,
    }
    const validatedMeta = parseLearningCanvasMetadata(nextMeta)

    tx.set(parentRef, validatedMeta)
    tx.set(contentRef, parsedContent)
  })
}

export async function publish(
  classId: string,
  canvasId: string,
  db: Firestore = firestore,
): Promise<void> {
  const ref = learningCanvasRef(db, classId, canvasId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Canvas not found.')

  const existing = parseLearningCanvasMetadata(snap.data())
  if (existing.kind !== 'class') {
    throw new Error('Only class canvases can be published.')
  }
  if (!existing.title.trim()) {
    throw new Error('A title is required to publish a canvas.')
  }

  const batch = writeBatch(db)
  batch.update(ref, {
    status: 'published',
    updatedAt: Timestamp.now(),
  })
  await batch.commit()
}

export async function unpublish(
  classId: string,
  canvasId: string,
  db: Firestore = firestore,
): Promise<void> {
  const ref = learningCanvasRef(db, classId, canvasId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Canvas not found.')

  const existing = parseLearningCanvasMetadata(snap.data())
  if (existing.kind !== 'class') {
    throw new Error('Only class canvases can be unpublished.')
  }

  const batch = writeBatch(db)
  batch.update(ref, {
    status: 'draft',
    updatedAt: Timestamp.now(),
  })
  await batch.commit()
}

export async function rename(
  classId: string,
  canvasId: string,
  title: string,
  db: Firestore = firestore,
): Promise<void> {
  const cleanTitle = title.trim().slice(0, MAX_CANVAS_TITLE_LENGTH)
  if (!cleanTitle) {
    throw new Error('Canvas title cannot be empty.')
  }

  const ref = learningCanvasRef(db, classId, canvasId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Canvas not found.')

  const batch = writeBatch(db)
  batch.update(ref, {
    title: cleanTitle,
    updatedAt: Timestamp.now(),
  })
  await batch.commit()
}

export async function duplicate(
  classId: string,
  canvasId: string,
  newOwnerId?: string,
  db: Firestore = firestore,
): Promise<string> {
  const sourceRef = learningCanvasRef(db, classId, canvasId)
  const sourceContentRef = learningCanvasContentRef(db, classId, canvasId)

  const [sourceSnap, contentSnap] = await Promise.all([
    getDoc(sourceRef),
    getDoc(sourceContentRef),
  ])

  if (!sourceSnap.exists()) throw new Error('Source canvas not found.')
  const sourceMeta = parseLearningCanvasMetadata(sourceSnap.data())

  let content: LearningCanvasContent = {
    version: 1,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
  if (contentSnap.exists()) {
    content = parseLearningCanvasContent(contentSnap.data())
  }

  const targetRef = doc(learningCanvasesRef(db, classId))
  const targetContentRef = learningCanvasContentRef(db, classId, targetRef.id)
  const now = Timestamp.now()

  const copyMeta: LearningCanvasRecord = {
    ...sourceMeta,
    ownerId: newOwnerId ?? sourceMeta.ownerId,
    title: `Copy of ${sourceMeta.title}`.slice(0, MAX_CANVAS_TITLE_LENGTH),
    status: sourceMeta.kind === 'personal' ? 'private' : 'draft',
    sourceCanvasId: sourceSnap.id,
    createdAt: now,
    updatedAt: now,
  }

  const batch = writeBatch(db)
  batch.set(targetRef, parseLearningCanvasMetadata(copyMeta))
  batch.set(targetContentRef, content)
  await batch.commit()

  return targetRef.id
}

export async function copyToMyCanvases(
  classId: string,
  canvasId: string,
  studentUid: string,
  db: Firestore = firestore,
): Promise<string> {
  const sourceRef = learningCanvasRef(db, classId, canvasId)
  const sourceContentRef = learningCanvasContentRef(db, classId, canvasId)

  const [sourceSnap, contentSnap] = await Promise.all([
    getDoc(sourceRef),
    getDoc(sourceContentRef),
  ])

  if (!sourceSnap.exists()) throw new Error('Source canvas not found.')
  const sourceMeta = parseLearningCanvasMetadata(sourceSnap.data())

  if (sourceMeta.kind !== 'class' || sourceMeta.status !== 'published') {
    throw new Error('Only published class canvases can be copied to personal canvases.')
  }

  let content: LearningCanvasContent = {
    version: 1,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
  if (contentSnap.exists()) {
    content = parseLearningCanvasContent(contentSnap.data())
  }

  const targetRef = doc(learningCanvasesRef(db, classId))
  const targetContentRef = learningCanvasContentRef(db, classId, targetRef.id)
  const now = Timestamp.now()

  const personalMeta: LearningCanvasRecord = {
    ownerId: studentUid,
    classId,
    kind: 'personal',
    title: sourceMeta.title,
    description: sourceMeta.description,
    status: 'private',
    nodeCount: sourceMeta.nodeCount,
    edgeCount: sourceMeta.edgeCount,
    refs: sourceMeta.refs,
    sourceCanvasId: canvasId,
    createdAt: now,
    updatedAt: now,
  }

  const batch = writeBatch(db)
  batch.set(targetRef, parseLearningCanvasMetadata(personalMeta))
  batch.set(targetContentRef, content)
  await batch.commit()

  return targetRef.id
}

export async function deleteCanvas(
  classId: string,
  canvasId: string,
  db: Firestore = firestore,
): Promise<void> {
  const batch = writeBatch(db)
  batch.delete(learningCanvasContentRef(db, classId, canvasId))
  batch.delete(learningCanvasRef(db, classId, canvasId))
  await batch.commit()
}
