import { lazy } from 'react'

export * from './types'
export * from './schemas'
export * from './mapping'
export { default as CanvasBoard } from './components/CanvasBoard'
export type { CanvasBoardMode, CanvasBoardProps } from './components/CanvasBoard'
export { default as CanvasReviewView } from './components/CanvasReviewView'
export type { CanvasReviewViewProps } from './components/CanvasReviewView'

/**
 * Lazy-loaded CanvasBoard to ensure @xyflow/react remains out of the main bundle.
 */
export const LazyCanvasBoard = lazy(() => import('./components/CanvasBoard'))
export const LazyCanvasReviewView = lazy(() => import('./components/CanvasReviewView'))
