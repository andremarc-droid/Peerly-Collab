import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import { formatGrade, turnInState, turnInStateLabel } from './format'
import { parseGradeInput, parseTurnIn } from './schemas'
import { MAX_FEEDBACK_LENGTH } from './types'

const file = { fileId: 'abcdefghij1234', name: 'Essay.docx', mimeType: 'application/pdf', kind: 'file', url: 'https://drive.google.com/file/d/abcdefghij1234/view' }
const baseTurnIn = { studentId: 'u1', studentName: 'Sam', classId: 'c1', files: [file], turnedInAt: Timestamp.fromMillis(1000) }

describe('parseGradeInput', () => {
  it('accepts a whole number within the points', () => {
    expect(parseGradeInput(85, '  Nice work  ', 100)).toEqual({ grade: 85, feedback: 'Nice work' })
    expect(parseGradeInput(0, '', 10)).toEqual({ grade: 0, feedback: '' })
    expect(parseGradeInput(100, '', 100)).toEqual({ grade: 100, feedback: '' })
  })

  it('allows feedback without a grade, even when the assignment has no points', () => {
    expect(parseGradeInput(null, 'Please add sources', null)).toEqual({ grade: null, feedback: 'Please add sources' })
    expect(parseGradeInput(undefined, '', 50)).toEqual({ grade: null, feedback: '' })
  })

  it('rejects a grade above the points, negative, or not whole', () => {
    expect(() => parseGradeInput(101, '', 100)).toThrow(/at most 100/)
    expect(() => parseGradeInput(-1, '', 100)).toThrow(/whole number/)
    expect(() => parseGradeInput(7.5, '', 100)).toThrow(/whole number/)
  })

  it('rejects a grade on an assignment without points', () => {
    expect(() => parseGradeInput(5, '', null)).toThrow(/no points/)
  })

  it('rejects feedback that is too long', () => {
    expect(() => parseGradeInput(null, 'x'.repeat(MAX_FEEDBACK_LENGTH + 1), 10)).toThrow(/at most/)
  })
})

describe('parseTurnIn grading fields', () => {
  it('treats a turn-in without grading fields as not graded', () => {
    expect(parseTurnIn(baseTurnIn)).toMatchObject({ grade: null, feedback: '', gradedAt: null })
  })

  it('reads a saved grade and feedback', () => {
    const gradedAt = Timestamp.fromMillis(2000)
    expect(parseTurnIn({ ...baseTurnIn, grade: 90, feedback: 'Great', gradedAt })).toMatchObject({ grade: 90, feedback: 'Great', gradedAt })
  })

  it('rejects invalid grading data', () => {
    expect(() => parseTurnIn({ ...baseTurnIn, grade: 'A' })).toThrow(/grade/)
    expect(() => parseTurnIn({ ...baseTurnIn, grade: 1.5 })).toThrow(/grade/)
    expect(() => parseTurnIn({ ...baseTurnIn, feedback: 5 })).toThrow(/feedback/)
    expect(() => parseTurnIn({ ...baseTurnIn, gradedAt: 'yesterday' })).toThrow(/grading time/)
  })
})

describe('graded state and display', () => {
  const assignment = { dueAt: null, acceptsTurnIn: true }

  it('is graded once the instructor has saved a grade or feedback', () => {
    const turnedInAt = Timestamp.fromMillis(1000)
    expect(turnInState(assignment, { turnedInAt })).toBe('turned_in')
    expect(turnInState(assignment, { turnedInAt, gradedAt: null })).toBe('turned_in')
    expect(turnInState(assignment, { turnedInAt, gradedAt: Timestamp.fromMillis(2000) })).toBe('graded')
    expect(turnInStateLabel.graded).toBe('Graded')
  })

  it('formats the grade with or without points', () => {
    expect(formatGrade(85, 100)).toBe('85 / 100')
    expect(formatGrade(7, null)).toBe('7')
  })
})
