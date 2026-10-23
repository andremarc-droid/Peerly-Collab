import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  isEmulatorEnvironment,
  validateEnvironment,
  cleanupDeprecatedCollections,
  DEPRECATED_ROOT_COLLECTIONS,
} from './cleanup-deprecated-collections'
import type { Firestore } from 'firebase-admin/firestore'

describe('cleanup-deprecated-collections safety and environment checks', () => {
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

  it('dry-run reports counts without deleting documents', async () => {
    const mockDocs = [{ ref: { id: 'item-1' } }, { ref: { id: 'item-2' } }]
    const mockCol = {
      get: vi.fn().mockResolvedValue({ size: 2, docs: mockDocs }),
    }
    const recursiveDelete = vi.fn().mockResolvedValue(undefined)
    const mockDb = {
      collection: vi.fn().mockReturnValue(mockCol),
      recursiveDelete,
    } as unknown as Firestore

    const report = await cleanupDeprecatedCollections({
      projectId: 'demo-peerly-collab',
      apply: false,
      db: mockDb,
    })

    expect(report.dryRun).toBe(true)
    expect(report.isEmulator).toBe(true)
    expect(report.totalDocumentsDeleted).toBe(0)
    expect(report.countsByCollection.games).toBe(2)
    expect(recursiveDelete).not.toHaveBeenCalled()
  })

  it('apply deletes documents using recursiveDelete', async () => {
    const mockDocs = [{ ref: { id: 'item-1' } }]
    const mockCol = {
      get: vi.fn().mockResolvedValue({ size: 1, docs: mockDocs }),
    }
    const recursiveDelete = vi.fn().mockResolvedValue(undefined)
    const mockDb = {
      collection: vi.fn().mockReturnValue(mockCol),
      recursiveDelete,
    } as unknown as Firestore

    const report = await cleanupDeprecatedCollections({
      projectId: 'demo-peerly-collab',
      apply: true,
      db: mockDb,
    })

    expect(report.dryRun).toBe(false)
    expect(report.totalDocumentsDeleted).toBe(DEPRECATED_ROOT_COLLECTIONS.length)
    expect(recursiveDelete).toHaveBeenCalledTimes(DEPRECATED_ROOT_COLLECTIONS.length)
  })
})
