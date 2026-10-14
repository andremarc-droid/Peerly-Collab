import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { Timestamp, doc, getDoc, setDoc, type Firestore } from 'firebase/firestore'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import rules from '../../../../firestore.rules?raw'
import { toLocalInputValue } from '../format'
import { createAssignment, defaultAssignmentDueAt } from './assignmentService'

const projectId = 'demo-peerly-collab'
let environment: RulesTestEnvironment
const modularDb = (db: unknown) => db as Firestore

beforeAll(async () => {
  environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8180, rules } })
})
afterEach(async () => environment?.clearFirestore())
afterAll(async () => environment?.cleanup())

describe('assignmentService due date defaults', () => {
  it('defaults due date to today at 11:59 PM local time', () => {
    const testDate = new Date(2026, 9, 15, 8, 30, 0)
    const dueAt = defaultAssignmentDueAt(testDate)
    const local = toLocalInputValue(dueAt)
    expect(local).toBe('2026-10-15T23:59')
    const dateObj = dueAt.toDate()
    expect(dateObj.getFullYear()).toBe(2026)
    expect(dateObj.getMonth()).toBe(9)
    expect(dateObj.getDate()).toBe(15)
    expect(dateObj.getHours()).toBe(23)
    expect(dateObj.getMinutes()).toBe(59)
    expect(dateObj.getSeconds()).toBe(0)
  })

  it('automatically defaults dueAt to today when creating a new assignment', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await Promise.all([
        setDoc(doc(db, 'users/teacher'), { uid: 'teacher', role: 'instructor' }),
        setDoc(doc(db, 'classes/c1'), {
          ownerId: 'teacher',
          ownerName: 'Teacher',
          name: 'Math',
          section: '',
          subject: '',
          description: '',
          joinCode: 'ABC234',
          joinEnabled: true,
          requireApproval: false,
          status: 'active',
          accent: 'pinstripe',
          createdAt: Timestamp.fromMillis(1000),
          updatedAt: Timestamp.fromMillis(1000),
          codeRotatedAt: Timestamp.fromMillis(1000),
        }),
      ])
    })

    const db = modularDb(environment.authenticatedContext('teacher', { email_verified: true }).firestore())
    const id = await createAssignment('c1', 'teacher', 'Homework 1', db)

    const snap = await getDoc(doc(db, 'classes/c1/assignments', id))
    expect(snap.exists()).toBe(true)
    const data = snap.data()
    expect(data?.dueAt).not.toBeNull()

    const today = new Date()
    const dueAtDate = data?.dueAt.toDate()
    expect(dueAtDate.getFullYear()).toBe(today.getFullYear())
    expect(dueAtDate.getMonth()).toBe(today.getMonth())
    expect(dueAtDate.getDate()).toBe(today.getDate())
    expect(dueAtDate.getHours()).toBe(23)
    expect(dueAtDate.getMinutes()).toBe(59)
  })
})
