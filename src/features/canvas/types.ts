import type { DriveKind } from '../modules/types'

export type CanvasCardType = 'note' | 'paragraph' | 'image' | 'link'

export interface CanvasCard {
  id: string
  type: CanvasCardType
  title?: string
  content: string
  url?: string
  driveFileId?: string
  driveKind?: DriveKind
  imageId?: string
  alt?: string
  position: { x: number; y: number }
}

export type CanvasLayoutMode = 'scattered' | 'fixed'
export type CanvasWrongPenalty = 'none' | 'half' | 'full'

export interface CanvasQuestion {
  order: number
  type: 'canvas'
  prompt: string
  points: number
  layoutMode: CanvasLayoutMode
  directed: boolean
  wrongPenalty: CanvasWrongPenalty
  cards: CanvasCard[]
}

export interface CanvasConnection {
  id: string
  from: string
  to: string
  points?: number
}

export interface CanvasAnswerKey {
  type: 'canvas'
  explanation: string
  connections: CanvasConnection[]
}

export interface CanvasBounds {
  width: number
  height: number
  cardWidth?: number
  cardHeight?: number
  padding?: number
}

export interface CanvasDiff {
  correct: string[]
  missed: string[]
  wrong: string[]
}
