import { collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, Timestamp, where, writeBatch, type Firestore } from 'firebase/firestore'
import { firestore } from '../../lib/firebase/firestore'
import { parseModule, parseResource } from './schemas'
import type { ModuleRecord, ModuleResource } from './types'

const modules = (db: Firestore, classId: string) => collection(db, 'classes', classId, 'modules')
const moduleRef = (db: Firestore, classId: string, id: string) => doc(db, 'classes', classId, 'modules', id)
const resources = (db: Firestore, classId: string, moduleId: string) => collection(db, 'classes', classId, 'modules', moduleId, 'resources')
const resourceRef = (db: Firestore, classId: string, moduleId: string, id: string) => doc(db, 'classes', classId, 'modules', moduleId, 'resources', id)
const asModule = (classId: string, id: string, data: unknown) => ({ ...parseModule(data), classId, id })

export async function createModule(classId: string, ownerId: string, title = 'Untitled module', db: Firestore = firestore): Promise<string> {
  const list = await getDocs(query(modules(db, classId), orderBy('order', 'asc')))
  const ref = doc(modules(db, classId)); const now = Timestamp.now()
  const value: ModuleRecord = { ownerId, title: title.trim().slice(0, 120) || 'Untitled module', description: '', order: list.size, status: 'draft', quizIds: [], resourceCount: 0, createdAt: now, updatedAt: now, publishedAt: null }
  await writeBatch(db).set(ref, value).commit(); return ref.id
}

export async function updateModule(classId: string, id: string, patch: Partial<Pick<ModuleRecord, 'title' | 'description' | 'quizIds'>>, db: Firestore = firestore): Promise<void> {
  const ref = moduleRef(db, classId, id); const snap = await getDoc(ref); if (!snap.exists()) throw new Error('Module not found.')
  const next = parseModule({ ...snap.data(), ...patch, updatedAt: Timestamp.now() }); await writeBatch(db).update(ref, { ...patch, updatedAt: next.updatedAt }).commit()
}

export async function reorderModules(classId: string, ids: string[], db: Firestore = firestore): Promise<void> {
  const snap = await getDocs(modules(db, classId)); if (ids.length !== snap.size || new Set(ids).size !== ids.length || ids.some((id) => !snap.docs.some((item) => item.id === id))) throw new Error('Reorder must include every module exactly once.')
  const batch = writeBatch(db); ids.forEach((id, order) => batch.update(moduleRef(db, classId, id), { order, updatedAt: Timestamp.now() })); await batch.commit()
}

export async function duplicateModule(classId: string, id: string, db: Firestore = firestore): Promise<string> {
  const source = await getDoc(moduleRef(db, classId, id)); if (!source.exists()) throw new Error('Module not found.')
  const data = parseModule(source.data()); const target = doc(modules(db, classId)); const now = Timestamp.now()
  const copy: ModuleRecord = { ...data, title: `Copy of ${data.title}`.slice(0, 120), status: 'draft', publishedAt: null, order: (await getDocs(modules(db, classId))).size, createdAt: now, updatedAt: now }
  const sourceResources = await getDocs(query(resources(db, classId, id), orderBy('order', 'asc')))
  const batch = writeBatch(db); batch.set(target, copy)
  sourceResources.docs.forEach((item) => { const child = doc(resources(db, classId, target.id)); const res = parseResource(item.data()); batch.set(child, { ...res, createdAt: now, updatedAt: now }) })
  await batch.commit(); return target.id
}

export async function publishModule(classId: string, id: string, db: Firestore = firestore): Promise<void> { await setPublished(classId, id, true, db) }
export async function unpublishModule(classId: string, id: string, db: Firestore = firestore): Promise<void> { await setPublished(classId, id, false, db) }
async function setPublished(classId: string, id: string, published: boolean, db: Firestore) {
  const ref = moduleRef(db, classId, id); const snap = await getDoc(ref); if (!snap.exists()) throw new Error('Module not found.')
  const value = parseModule(snap.data()); if (published && (!value.title.trim() || (value.resourceCount < 1 && value.quizIds.length < 1))) throw new Error('Publishing requires a title and at least one resource or attached quiz.')
  await writeBatch(db).update(ref, { status: published ? 'published' : 'draft', publishedAt: published ? Timestamp.now() : null, updatedAt: Timestamp.now() }).commit()
}

export async function deleteModuleCascade(classId: string, id: string, db: Firestore = firestore): Promise<void> {
  const path = resources(db, classId, id)
  while (true) { const page = await getDocs(query(path, limit(400))); if (page.empty) break; const batch = writeBatch(db); page.docs.forEach((item) => batch.delete(item.ref)); await batch.commit(); if (page.size < 400) break }
  await deleteDoc(moduleRef(db, classId, id))
}

export async function addResource(classId: string, moduleId: string, input: Omit<ModuleResource, 'createdAt' | 'updatedAt' | 'order'>, db: Firestore = firestore): Promise<string> {
  const parent = moduleRef(db, classId, moduleId); const parentSnap = await getDoc(parent); if (!parentSnap.exists()) throw new Error('Module not found.')
  const list = await getDocs(query(resources(db, classId, moduleId), orderBy('order', 'asc'))); if (list.size >= 10) throw new Error('A module can contain at most 10 resources.')
  const ref = doc(resources(db, classId, moduleId)); const now = Timestamp.now(); const value = parseResource({ ...input, order: list.size, createdAt: now, updatedAt: now })
  const batch = writeBatch(db); batch.set(ref, value); batch.update(parent, { resourceCount: list.size + 1, updatedAt: now }); await batch.commit(); return ref.id
}

export async function updateResource(classId: string, moduleId: string, id: string, patch: Partial<ModuleResource>, db: Firestore = firestore): Promise<void> {
  const ref = resourceRef(db, classId, moduleId, id); const snap = await getDoc(ref); if (!snap.exists()) throw new Error('Resource not found.')
  const next = parseResource({ ...snap.data(), ...patch, updatedAt: Timestamp.now() }); await writeBatch(db).update(ref, { ...patch, updatedAt: next.updatedAt }).commit()
}
export async function deleteResource(classId: string, moduleId: string, id: string, db: Firestore = firestore): Promise<void> {
  const parent = moduleRef(db, classId, moduleId); const parentSnap = await getDoc(parent); if (!parentSnap.exists()) throw new Error('Module not found.')
  const resource = resourceRef(db, classId, moduleId, id); const resourceSnap = await getDoc(resource); if (!resourceSnap.exists()) throw new Error('Resource not found.')
  const now = Timestamp.now(); const batch = writeBatch(db); batch.delete(resource); batch.update(parent, { resourceCount: Math.max(0, parseModule(parentSnap.data()).resourceCount - 1), updatedAt: now }); await batch.commit()
}
export async function reorderResources(classId: string, moduleId: string, ids: string[], db: Firestore = firestore): Promise<void> {
  const snap = await getDocs(resources(db, classId, moduleId)); if (ids.length !== snap.size || new Set(ids).size !== ids.length || ids.some((id) => !snap.docs.some((item) => item.id === id))) throw new Error('Reorder must include every resource exactly once.')
  const batch = writeBatch(db); ids.forEach((id, order) => batch.update(resourceRef(db, classId, moduleId, id), { order, updatedAt: Timestamp.now() })); await batch.commit()
}
export async function setAttachedQuizzes(classId: string, moduleId: string, quizIds: string[], ownerId: string, db: Firestore = firestore): Promise<void> {
  if (quizIds.length > 10 || new Set(quizIds).size !== quizIds.length) throw new Error('Choose up to 10 distinct quizzes.')
  const quizzes = await Promise.all(quizIds.map((id) => getDoc(doc(db, 'quizzes', id))))
  if (quizzes.some((item) => !item.exists() || item.data().classId !== classId || item.data().ownerId !== ownerId)) throw new Error('Every attached quiz must belong to this class and owner.')
  await updateModule(classId, moduleId, { quizIds }, db)
}
export function subscribeToModules(classId: string, role: 'instructor' | 'student', onChange: (items: ReturnType<typeof asModule>[]) => void, onError: (error: Error) => void, db: Firestore = firestore) {
  const base = modules(db, classId); const q = role === 'student' ? query(base, where('status', '==', 'published'), orderBy('order')) : query(base, orderBy('order'))
  return onSnapshot(q, (snap) => onChange(snap.docs.map((item) => asModule(classId, item.id, item.data()))), onError)
}
export function subscribeToResources(classId: string, moduleId: string, onChange: (items: (ModuleResource & { id: string })[]) => void, onError: (error: Error) => void, db: Firestore = firestore) { return onSnapshot(query(resources(db, classId, moduleId), orderBy('order')), (snap) => onChange(snap.docs.map((item) => ({ ...parseResource(item.data()), id: item.id }))), onError) }
export async function getModule(classId: string, id: string, db: Firestore = firestore) { const snap = await getDoc(moduleRef(db, classId, id)); return snap.exists() ? asModule(classId, snap.id, snap.data()) : null }
export function subscribeToModule(classId: string, id: string, onChange: (item: ReturnType<typeof asModule> | null) => void, onError: (error: Error) => void, db: Firestore = firestore) {
  return onSnapshot(moduleRef(db, classId, id), (snap) => {
    if (!snap.exists()) { onChange(null); return }
    onChange(asModule(classId, snap.id, snap.data()))
  }, onError)
}
