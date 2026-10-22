import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  isEmulatorEnvironment,
  validateEnvironment,
  removeCanvasQuizzes,
  CANVAS_SUBCOLLECTIONS,
} from './remove-canvas-quizzes'
import type { Firestore } from 'firebase-admin/firestore'

describe('remove-canvas-quizzes safety and environment checks', () => {
  const originalHost = process.env.FIRESTORE_EMULATOR_HOST

  beforeEach(() => {
    delete process.env.FIRESTORE_EMULATOR_HOST
  })

  afterEach(() => {
    if (originalHost !== undefined) {
      process.env.FIRESTORE_EMULATOR_HOST = originalHost
    } else {
      delete process.env.FIRESTORE_EMULATOR_HOST
    }
  })

  it('detects emulator by demo- prefix', () => {
    expect(isEmulatorEnvironment('demo-peerly-collab')).toBe(true)
    expect(isEmulatorEnvironment('peerly-collab-prod')).toBe(false)
  })

  it('detects emulator by FIRESTORE_EMULATOR_HOST environment variable', () => {
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
    expect(isEmulatorEnvironment('peerly-collab-prod')).toBe(true)
  })

  it('refuses to run against production without override flag', () => {
    expect(() => validateEnvironment('peerly-collab-prod', false)).toThrowError(
      /Refusing to run against non-emulator environment/,
    )
  })

  it('permits running against production when allowProduction is true', () => {
    const isEmulator = validateEnvironment('peerly-collab-prod', true)
    expect(isEmulator).toBe(false)
  })

  it('permits running in demo project without override flag', () => {
    const isEmulator = validateEnvironment('demo-peerly-collab', false)
    expect(isEmulator).toBe(true)
  })
})

describe('removeCanvasQuizzes execution logic', () => {
  function createMockFirestore(options?: {
    quizzes?: Array<{ id: string; data: Record<string, unknown>; subcollections?: Record<string, string[]> }>
  }) {
    const quizzes = options?.quizzes ?? []
    const deletedDocs = new Set<string>()
    const committedBatches: Array<Set<string>> = []

    const mockDb = {
      collection: (colName: string) => {
        if (colName !== 'quizzes') throw new Error(`Unexpected collection ${colName}`)
        return {
          where: (field: string, op: string, value: unknown) => {
            return {
              get: async () => {
                const matching = quizzes.filter(
                  (q) => !deletedDocs.has(q.id) && q.data[field] === value,
                )
                return {
                  size: matching.length,
                  docs: matching.map((q) => {
                    const subMap = q.subcollections || {}
                    const docRef = {
                      id: q.id,
                      delete: async () => {
                        deletedDocs.add(q.id)
                      },
                      collection: (subName: string) => {
                        const subDocIds = (subMap[subName] || []).filter(
                          (id) => !deletedDocs.has(`${q.id}/${subName}/${id}`),
                        )
                        return {
                          get: async () => ({
                            size: subDocIds.length,
                            docs: subDocIds.map((subId) => ({
                              id: subId,
                              ref: {
                                id: subId,
                                path: `${q.id}/${subName}/${subId}`,
                              },
                            })),
                          }),
                        }
                      },
                    }
                    return {
                      id: q.id,
                      data: () => q.data,
                      ref: docRef,
                    }
                  }),
                }
              },
            }
          },
        }
      },
      batch: () => {
        const batchDeletes = new Set<string>()
        return {
          delete: (ref: { path?: string; id: string }) => {
            batchDeletes.add(ref.path || ref.id)
          },
          commit: async () => {
            committedBatches.push(new Set(batchDeletes))
            for (const item of batchDeletes) {
              deletedDocs.add(item)
            }
          },
        }
      },
    }

    return {
      db: mockDb as unknown as Firestore,
      deletedDocs,
      committedBatches,
    }
  }

  it('runs dry-run by default without deleting documents', async () => {
    const { db, deletedDocs } = createMockFirestore({
      quizzes: [
        {
          id: 'q-canvas-1',
          data: { title: 'Prebuilt Canvas', mode: 'canvas' },
          subcollections: {
            questions: ['q1'],
            answerKeys: ['q1'],
            images: ['img1', 'img2'],
          },
        },
        {
          id: 'q-canvas-2',
          data: { title: 'Blank Canvas', type: 'canvas' },
          subcollections: {
            questions: ['q2'],
            attempts: ['att1'],
          },
        },
        {
          id: 'q-quiz-3',
          data: { title: 'Regular Quiz', mode: 'quiz' },
          subcollections: {
            questions: ['q3'],
          },
        },
      ],
    })

    const report = await removeCanvasQuizzes({
      projectId: 'demo-peerly-test',
      db,
      apply: false,
    })

    expect(report.dryRun).toBe(true)
    expect(report.canvasQuizzesFound).toBe(2)
    expect(report.totalQuizzesDeleted).toBe(0)
    expect(report.totalSubDocsDeleted).toBe(0)
    expect(deletedDocs.size).toBe(0)

    const q1 = report.quizzes.find((q) => q.id === 'q-canvas-1')
    expect(q1?.title).toBe('Prebuilt Canvas')
    expect(q1?.totalSubDocs).toBe(4) // 1 question + 1 answerKey + 2 images
    expect(q1?.subcollections.images).toBe(2)

    const q2 = report.quizzes.find((q) => q.id === 'q-canvas-2')
    expect(q2?.title).toBe('Blank Canvas')
    expect(q2?.totalSubDocs).toBe(2) // 1 question + 1 attempt
  })

  it('applies cascade deletion when apply is true', async () => {
    const { db, deletedDocs, committedBatches } = createMockFirestore({
      quizzes: [
        {
          id: 'q-canvas-1',
          data: { title: 'Prebuilt Canvas', mode: 'canvas' },
          subcollections: {
            questions: ['q1'],
            images: ['img1'],
          },
        },
      ],
    })

    const report = await removeCanvasQuizzes({
      projectId: 'demo-peerly-test',
      db,
      apply: true,
    })

    expect(report.dryRun).toBe(false)
    expect(report.canvasQuizzesFound).toBe(1)
    expect(report.totalQuizzesDeleted).toBe(1)
    expect(report.totalSubDocsDeleted).toBe(2)
    expect(deletedDocs.has('q-canvas-1')).toBe(true)
    expect(deletedDocs.has('q-canvas-1/questions/q1')).toBe(true)
    expect(deletedDocs.has('q-canvas-1/images/img1')).toBe(true)
    expect(committedBatches.length).toBeGreaterThan(0)
  })

  it('scans all 12 required subcollections', () => {
    expect(CANVAS_SUBCOLLECTIONS).toEqual([
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
    ])
  })
})
