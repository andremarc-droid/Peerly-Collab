import {
  collection, doc, getCountFromServer, getDoc, getDocs, onSnapshot, orderBy, query, runTransaction, Timestamp, where,
  type Firestore,
} from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { generateJoinCode } from '../joinCode'
import { parseClass, validateClassPatch } from '../schemas'
import type { ClassAccent, ClassPatch, ClassRecord, ClassWithId, NewClass } from '../types'
import { classCodeRef, classRef, classesRef } from './paths'

export class JoinCodeCollisionError extends Error {
  constructor() { super('Could not generate an unused class code. Please try again.'); this.name = 'JoinCodeCollisionError' }
}

function codeProjection(classId: string, value: ClassRecord) {
  return {
    classId, ownerId: value.ownerId, className: value.name, ownerName: value.ownerName,
    joinEnabled: value.joinEnabled, requireApproval: value.requireApproval, archived: value.status === 'archived',
  }
}

function record(id: string, data: unknown): ClassWithId { return { ...parseClass(data), id } }

export async function createClass(
  input: NewClass,
  db: Firestore = firestore,
  makeCode: () => string = generateJoinCode,
  maxAttempts = 8,
): Promise<ClassWithId> {
  if (!input.name.trim()) throw new Error('Class name is required.')
  const ref = doc(collection(db, 'classes'))
  return runTransaction(db, async (transaction) => {
    let code = ''
    let available = false
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      code = makeCode()
      const existing = await transaction.get(classCodeRef(db, code))
      if (!existing.exists()) { available = true; break }
    }
    if (!available) throw new JoinCodeCollisionError()
    const now = Timestamp.now()
    const value: ClassRecord = parseClass({
      ownerId: input.ownerId, ownerName: input.ownerName, name: input.name.trim(), section: input.section ?? '',
      subject: input.subject ?? '', description: input.description ?? '', joinCode: code,
      joinEnabled: input.joinEnabled ?? true, requireApproval: input.requireApproval ?? false, status: 'active',
      accent: input.accent ?? 'pinstripe' satisfies ClassAccent, createdAt: now, updatedAt: now, codeRotatedAt: now,
    })
    transaction.set(ref, value)
    transaction.set(classCodeRef(db, code), codeProjection(ref.id, value))
    return { ...value, id: ref.id }
  })
}

export async function getClass(classId: string, db: Firestore = firestore): Promise<ClassWithId | null> {
  const snapshot = await getDoc(classRef(db, classId))
  return snapshot.exists() ? record(snapshot.id, snapshot.data()) : null
}

export async function updateClass(classId: string, value: ClassPatch, db: Firestore = firestore): Promise<void> {
  const patch = validateClassPatch(value)
  if (!Object.keys(patch).length) return
  await runTransaction(db, async (transaction) => {
    const ref = classRef(db, classId)
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists()) throw new Error('Class not found.')
    const current = parseClass(snapshot.data())
    const next = parseClass({ ...current, ...patch, updatedAt: Timestamp.now() })
    transaction.update(ref, { ...patch, updatedAt: next.updatedAt })
    transaction.set(classCodeRef(db, current.joinCode), codeProjection(classId, next))
  })
}

async function updateJoinSettings(classId: string, patch: Partial<Pick<ClassRecord, 'joinEnabled' | 'requireApproval' | 'status'>>, db: Firestore): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const ref = classRef(db, classId)
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists()) throw new Error('Class not found.')
    const current = parseClass(snapshot.data())
    const next = parseClass({ ...current, ...patch, updatedAt: Timestamp.now() })
    transaction.update(ref, { ...patch, updatedAt: next.updatedAt })
    transaction.set(classCodeRef(db, current.joinCode), codeProjection(classId, next))
  })
}

export const setJoinEnabled = (classId: string, enabled: boolean, db: Firestore = firestore) => updateJoinSettings(classId, { joinEnabled: enabled }, db)
export const setRequireApproval = (classId: string, required: boolean, db: Firestore = firestore) => updateJoinSettings(classId, { requireApproval: required }, db)
export const archiveClass = (classId: string, db: Firestore = firestore) => updateJoinSettings(classId, { status: 'archived' }, db)
export const restoreClass = (classId: string, db: Firestore = firestore) => updateJoinSettings(classId, { status: 'active' }, db)

export async function rotateJoinCode(classId: string, db: Firestore = firestore, makeCode: () => string = generateJoinCode, maxAttempts = 8): Promise<string> {
  return runTransaction(db, async (transaction) => {
    const ref = classRef(db, classId)
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists()) throw new Error('Class not found.')
    const current = parseClass(snapshot.data())
    let code = ''
    let available = false
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      code = makeCode()
      if (code === current.joinCode) continue
      const existing = await transaction.get(classCodeRef(db, code))
      if (!existing.exists()) { available = true; break }
    }
    if (!available) throw new JoinCodeCollisionError()
    const next = parseClass({ ...current, joinCode: code, codeRotatedAt: Timestamp.now(), updatedAt: Timestamp.now() })
    transaction.delete(classCodeRef(db, current.joinCode))
    transaction.set(classCodeRef(db, code), codeProjection(classId, next))
    transaction.update(ref, { joinCode: code, codeRotatedAt: next.codeRotatedAt, updatedAt: next.updatedAt })
    return code
  })
}

export async function listMyClasses(ownerId: string, db: Firestore = firestore): Promise<ClassWithId[]> {
  const result = await getDocs(query(classesRef(db), where('ownerId', '==', ownerId), orderBy('updatedAt', 'desc')))
  return result.docs.map((item) => record(item.id, item.data()))
}

export function watchMyClasses(ownerId: string, onChange: (classes: ClassWithId[]) => void, onError: (error: Error) => void, db: Firestore = firestore) {
  return onSnapshot(query(classesRef(db), where('ownerId', '==', ownerId), orderBy('updatedAt', 'desc')),
    (snapshot) => onChange(snapshot.docs.map((item) => record(item.id, item.data()))), onError)
}

export async function countMyClasses(ownerId: string, db: Firestore = firestore): Promise<number> {
  const result = await getCountFromServer(query(classesRef(db), where('ownerId', '==', ownerId)))
  return result.data().count
}
