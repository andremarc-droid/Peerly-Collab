import { initializeTestEnvironment, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { Timestamp, doc, getDoc, setDoc, serverTimestamp, type Firestore } from 'firebase/firestore'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import rules from '../../../../firestore.rules?raw'
import { parseTurnIn } from '../schemas'
import { submitTurnIn } from './turnInService'
import type { DriveFile } from '../types'

const projectId = 'demo-peerly-collab'
let environment: RulesTestEnvironment
const modularDb = (db: unknown) => db as Firestore
const now = Timestamp.fromMillis(1000)
const turnInPath = 'classes/c1/assignments/a1/turnIns/student'
const file: DriveFile = { fileId: 'abcdefghij1234', name: 'Essay.pdf', mimeType: 'application/pdf', kind: 'file', url: 'https://drive.google.com/file/d/abcdefghij1234/view' }

beforeAll(async () => {
  environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8180, rules } })
})
beforeEach(async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await Promise.all([
      setDoc(doc(db, 'users/teacher'), { uid: 'teacher', role: 'instructor' }),
      setDoc(doc(db, 'users/student'), { uid: 'student', role: 'student' }),
      setDoc(doc(db, 'classes/c1'), { ownerId: 'teacher', ownerName: 'Teacher', name: 'Math', section: '', subject: '', description: '', joinCode: 'ABC234', joinEnabled: true, requireApproval: false, status: 'active', accent: 'pinstripe', createdAt: now, updatedAt: now, codeRotatedAt: now }),
      setDoc(doc(db, 'enrollments/c1_student'), { classId: 'c1', ownerId: 'teacher', uid: 'student', studentName: 'Student', studentPhotoURL: null, className: 'Math', status: 'active', codeUsed: 'ABC234', joinedAt: now, updatedAt: now }),
      setDoc(doc(db, 'classes/c1/assignments/a1'), { ownerId: 'teacher', title: 'Essay', instructions: 'Write it.', status: 'published', dueAt: null, points: 100, acceptsTurnIn: true, collectorEmail: 'teacher@example.com', attachments: [], createdAt: now, updatedAt: now, publishedAt: now }),
    ])
  })
})
afterEach(async () => environment?.clearFirestore())
afterAll(async () => environment?.cleanup())

const studentDb = () => modularDb(environment.authenticatedContext('student', { email_verified: true }).firestore())

describe('turning in without files', () => {
  it('lets a student turn in with no files after confirming, and the record reads back cleanly', async () => {
    const db = studentDb()
    await submitTurnIn({ classId: 'c1', assignmentId: 'a1', studentId: 'student', studentName: 'Student', files: [] }, db)
    const snap = await getDoc(doc(db, turnInPath))
    expect(snap.exists()).toBe(true)
    expect(parseTurnIn(snap.data()).files).toEqual([])
  })

  it('lets a student replace earlier files with an empty turn-in', async () => {
    const db = studentDb()
    await submitTurnIn({ classId: 'c1', assignmentId: 'a1', studentId: 'student', studentName: 'Student', files: [file] }, db)
    await submitTurnIn({ classId: 'c1', assignmentId: 'a1', studentId: 'student', studentName: 'Student', files: [] }, db)
    const snap = await getDoc(doc(db, turnInPath))
    expect(parseTurnIn(snap.data()).files).toEqual([])
  })

  it('still rejects a files value that is not a list', async () => {
    await assertFails(setDoc(doc(studentDb(), turnInPath), { studentId: 'student', studentName: 'Student', classId: 'c1', files: 'none', turnedInAt: serverTimestamp() }))
  })
})
