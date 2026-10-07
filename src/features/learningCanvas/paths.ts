import { collection, doc, type CollectionReference, type DocumentReference, type Firestore } from 'firebase/firestore'
import type { LearningCanvasRecord, LearningCanvasContent } from './types'

export const learningCanvasesRef = (db: Firestore, classId: string): CollectionReference<LearningCanvasRecord> =>
  collection(db, 'classes', classId, 'learningCanvases') as CollectionReference<LearningCanvasRecord>

export const learningCanvasRef = (db: Firestore, classId: string, canvasId: string): DocumentReference<LearningCanvasRecord> =>
  doc(db, 'classes', classId, 'learningCanvases', canvasId) as DocumentReference<LearningCanvasRecord>

export const learningCanvasContentRef = (db: Firestore, classId: string, canvasId: string): DocumentReference<LearningCanvasContent> =>
  doc(db, 'classes', classId, 'learningCanvases', canvasId, 'content', 'main') as DocumentReference<LearningCanvasContent>
