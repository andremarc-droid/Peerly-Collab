import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp, type Firestore } from 'firebase/firestore'
import { gradeBlankCanvasAttempt } from './resultService'

const mockTx = {
  get: vi.fn(),
  update: vi.fn(),
}

const mockDb = vi.hoisted(() => ({
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  runTransaction: vi.fn(),
}))

vi.mock('../../../lib/firebase/firestore', () => ({ firestore: {} }))
vi.mock('./paths', () => ({
  attemptRef: (_db: unknown, quizId: string, attemptId: string) => ({ path: `quizzes/${quizId}/attempts/${attemptId}` }),
  attemptsRef: (_db: unknown, quizId: string) => ({ path: `quizzes/${quizId}/attempts` }),
  questionRef: (_db: unknown, quizId: string, qId: string) => ({ path: `quizzes/${quizId}/questions/${qId}` }),
  resultRef: (_db: unknown, quizId: string, attemptId: string) => ({ path: `quizzes/${quizId}/results/${attemptId}` }),
}))
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  return {
    ...actual,
    query: (target: unknown) => target,
    where: () => ({}),
    getDoc: (...args: unknown[]) => mockDb.getDoc(...args),
    getDocs: (...args: unknown[]) => mockDb.getDocs(...args),
    runTransaction: (_db: unknown, fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
  }
})

const boardDoc = {
  exists: () => true,
  data: () => ({
    type: 'canvas',
    prompt: 'Draw canvas',
    points: 25,
    order: 0,
    cards: [],
    showRubricToStudents: true,
    maxCards: 20,
    maxConnections: 40,
    allowedCardTypes: ['note', 'paragraph', 'link'],
  }),
}

const resultDoc = (userId: string) => ({
  exists: () => true,
  data: () => ({
    userId,
    score: 0,
    maxScore: 25,
    perQuestion: {},
    gradedAt: Timestamp.fromMillis(1000),
    reviewStatus: 'pending',
  }),
})

describe('gradeBlankCanvasAttempt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('grades single attempt when no teamId is present', async () => {
    // Current attempt has no teamId
    mockDb.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ userId: 'solo-user' }),
    })

    mockTx.get.mockImplementation((ref: { path: string }) => {
      if (ref.path.includes('questions/board')) return Promise.resolve(boardDoc)
      if (ref.path.includes('results/attempt-1')) return Promise.resolve(resultDoc('solo-user'))
      return Promise.resolve({ exists: () => false })
    })

    await gradeBlankCanvasAttempt('q1', 'attempt-1', { score: 20, feedback: 'Great job', gradedBy: 'teacher' }, {} as Firestore)

    expect(mockTx.update).toHaveBeenCalledTimes(1)
    expect(mockTx.update).toHaveBeenCalledWith(
      { path: 'quizzes/q1/results/attempt-1' },
      expect.objectContaining({
        score: 20,
        reviewStatus: 'graded',
        feedback: 'Great job',
        gradedBy: 'teacher',
      }),
    )
  })

  it('grades all member results when attempt has teamId', async () => {
    // Current attempt belongs to team-alpha
    mockDb.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ userId: 'user-1', teamId: 'team-alpha', teamName: 'Alpha' }),
    })

    // Query for attempts with teamId == 'team-alpha' returns 2 members
    mockDb.getDocs.mockResolvedValueOnce({
      empty: false,
      docs: [
        { id: 'att-user-1', data: () => ({ userId: 'user-1', teamId: 'team-alpha' }) },
        { id: 'att-user-2', data: () => ({ userId: 'user-2', teamId: 'team-alpha' }) },
      ],
    })

    mockTx.get.mockImplementation((ref: { path: string }) => {
      if (ref.path.includes('questions/board')) return Promise.resolve(boardDoc)
      if (ref.path.includes('results/att-user-1')) return Promise.resolve(resultDoc('user-1'))
      if (ref.path.includes('results/att-user-2')) return Promise.resolve(resultDoc('user-2'))
      return Promise.resolve({ exists: () => false })
    })

    await gradeBlankCanvasAttempt('q1', 'att-user-1', { score: 22, feedback: 'Super team board!', gradedBy: 'teacher' }, {} as Firestore)

    expect(mockTx.update).toHaveBeenCalledTimes(2)
    expect(mockTx.update).toHaveBeenCalledWith(
      { path: 'quizzes/q1/results/att-user-1' },
      expect.objectContaining({
        score: 22,
        reviewStatus: 'graded',
        feedback: 'Super team board!',
        gradedBy: 'teacher',
      }),
    )
    expect(mockTx.update).toHaveBeenCalledWith(
      { path: 'quizzes/q1/results/att-user-2' },
      expect.objectContaining({
        score: 22,
        reviewStatus: 'graded',
        feedback: 'Super team board!',
        gradedBy: 'teacher',
      }),
    )
  })

  it('rejects scores exceeding board max points', async () => {
    mockDb.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ userId: 'user-1' }),
    })
    mockTx.get.mockImplementation((ref: { path: string }) => {
      if (ref.path.includes('questions/board')) return Promise.resolve(boardDoc)
      return Promise.resolve(resultDoc('user-1'))
    })

    await expect(
      gradeBlankCanvasAttempt('q1', 'attempt-1', { score: 30, gradedBy: 'teacher' }, {} as Firestore),
    ).rejects.toThrow('Score must be between 0 and 25')
  })
})
