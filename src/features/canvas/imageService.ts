import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Firestore,
  type Timestamp,
} from 'firebase/firestore'
import { firestore } from '../../lib/firebase/firestore'
import { imageRef, imagesRef } from '../quizzes/services/paths'

export const MAX_CANVAS_IMAGES = 12

export interface CanvasImageRecord {
  id: string
  data: string // base64 without prefix
  mimeType: 'image/jpeg' | 'image/webp'
  width: number
  height: number
  bytes: number
  createdAt: Timestamp
}

export interface SaveImageInput {
  data: string
  mimeType: 'image/jpeg' | 'image/webp'
  width: number
  height: number
  bytes: number
}

/**
 * Saves or updates an image document under quizzes/{quizId}/images/{imageId}.
 * Enforces the 12-image cap per canvas board.
 */
export async function saveImage(
  quizId: string,
  imageId: string | null,
  image: SaveImageInput,
  db: Firestore = firestore,
): Promise<string> {
  const coll = imagesRef(db, quizId)
  const targetRef = imageId ? imageRef(db, quizId, imageId) : doc(coll)

  // Enforce 12-image cap if this would create a new image document
  if (!imageId) {
    const existing = await getDocs(coll)
    if (existing.size >= MAX_CANVAS_IMAGES) {
      throw new Error('Canvas can have at most 12 images.')
    }
  } else {
    const existingDoc = await getDoc(targetRef)
    if (!existingDoc.exists()) {
      const existing = await getDocs(coll)
      if (existing.size >= MAX_CANVAS_IMAGES) {
        throw new Error('Canvas can have at most 12 images.')
      }
    }
  }

  await setDoc(targetRef, {
    data: image.data,
    mimeType: image.mimeType,
    width: image.width,
    height: image.height,
    bytes: image.bytes,
    createdAt: serverTimestamp(),
  })

  return targetRef.id
}

/**
 * Retrieves all image documents for a quiz.
 */
export async function listImages(
  quizId: string,
  db: Firestore = firestore,
): Promise<CanvasImageRecord[]> {
  const snapshot = await getDocs(imagesRef(db, quizId))
  return snapshot.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      data: data.data,
      mimeType: data.mimeType,
      width: data.width,
      height: data.height,
      bytes: data.bytes,
      createdAt: data.createdAt,
    }
  })
}

/**
 * Retrieves a single image document by ID.
 */
export async function getImage(
  quizId: string,
  imageId: string,
  db: Firestore = firestore,
): Promise<CanvasImageRecord | null> {
  const snapshot = await getDoc(imageRef(db, quizId, imageId))
  if (!snapshot.exists()) return null
  const data = snapshot.data()
  return {
    id: snapshot.id,
    data: data.data,
    mimeType: data.mimeType,
    width: data.width,
    height: data.height,
    bytes: data.bytes,
    createdAt: data.createdAt,
  }
}

/**
 * Deletes a single image document.
 */
export async function deleteImage(
  quizId: string,
  imageId: string,
  db: Firestore = firestore,
): Promise<void> {
  await deleteDoc(imageRef(db, quizId, imageId))
}

/**
 * Deletes any image documents under quizzes/{quizId}/images that are NOT referenced in referencedIds.
 * Returns array of deleted image IDs.
 */
export async function reconcileImages(
  quizId: string,
  referencedIds: string[] | Set<string>,
  db: Firestore = firestore,
): Promise<string[]> {
  const refSet = referencedIds instanceof Set ? referencedIds : new Set(referencedIds)
  const snapshot = await getDocs(imagesRef(db, quizId))
  const toDelete: string[] = []

  for (const d of snapshot.docs) {
    if (!refSet.has(d.id)) {
      toDelete.push(d.id)
    }
  }

  if (toDelete.length > 0) {
    for (let i = 0; i < toDelete.length; i += 400) {
      const batch = writeBatch(db)
      const chunk = toDelete.slice(i, i + 400)
      chunk.forEach((id) => batch.delete(imageRef(db, quizId, id)))
      await batch.commit()
    }
  }

  return toDelete
}
