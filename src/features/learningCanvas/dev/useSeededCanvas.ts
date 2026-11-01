import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'
import type { LearningCanvasContent, LearningCanvasRecord } from '../types'
import type { SeedBoardSize } from './seedBoard'

export interface SeededCanvasState {
  isSeeded: boolean
  seedSize: SeedBoardSize | null
  seededContent: LearningCanvasContent | null
  seededCanvasMeta: LearningCanvasRecord | null
  setSeedSize: (size: SeedBoardSize | null) => void
}

const DISABLED_SEEDED_STATE: SeededCanvasState = {
  isSeeded: false,
  seedSize: null,
  seededContent: null,
  seededCanvasMeta: null,
  setSeedSize: () => {},
}

/**
 * Hook providing a dev/debug-only seeded board (50, 150, 400 cards) for benchmarking without touching Firestore.
 * Lazy-loads `seedBoard.ts` and gates execution behind build-time flag `VITE_ENABLE_BENCH === 'true'`.
 */
export function useSeededCanvas(): SeededCanvasState {
  const isBenchEnabled = import.meta.env.VITE_ENABLE_BENCH === 'true'
  const [searchParams, setSearchParams] = useSearchParams()
  const seedParam = isBenchEnabled ? searchParams.get('seed') : null
  const isSeeded = seedParam === '50' || seedParam === '150' || seedParam === '400'
  const seedSize = isSeeded ? (Number(seedParam) as SeedBoardSize) : null

  const [seededContent, setSeededContent] = useState<LearningCanvasContent | null>(null)

  useEffect(() => {
    if (!isBenchEnabled || !isSeeded || !seedSize) {
      setSeededContent(null)
      return
    }

    let active = true
    import('./seedBoard').then((mod) => {
      if (active) {
        setSeededContent(mod.generateSeededBoard(seedSize))
      }
    })

    return () => {
      active = false
    }
  }, [isBenchEnabled, isSeeded, seedSize])

  if (!isBenchEnabled) {
    return DISABLED_SEEDED_STATE
  }

  const seededCanvasMeta: LearningCanvasRecord | null = isSeeded && seedSize
    ? {
        kind: 'personal',
        title: `[BENCHMARK] ${seedSize} Cards Board`,
        description: `Synthetic board (${seedSize} cards, ~1.5x edges, markdown, images). In-memory only.`,
        status: 'draft',
        nodeCount: seedSize,
        edgeCount: Math.round(seedSize * 1.5),
        refs: [],
        sourceCanvasId: null,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        ownerId: 'dev-user',
        classId: 'dev-class',
      }
    : null

  const setSeedSize = (size: SeedBoardSize | null) => {
    const next = new URLSearchParams(searchParams)
    if (size) {
      next.set('seed', String(size))
    } else {
      next.delete('seed')
    }
    setSearchParams(next)
  }

  return {
    isSeeded: isSeeded && !!seededContent,
    seedSize,
    seededContent,
    seededCanvasMeta,
    setSeedSize,
  }
}
