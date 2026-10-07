import type { Timestamp } from 'firebase/firestore'

export type LearningCanvasKind = 'class' | 'personal'
export type LearningCanvasStatus = 'draft' | 'published' | 'private'
export type LearningCanvasRefType = 'module' | 'quiz' | 'learning'

export interface LearningCanvasRef {
  type: LearningCanvasRefType
  id: string
}

export interface LearningCanvasRecord {
  ownerId: string
  classId: string
  kind: LearningCanvasKind
  title: string
  description: string
  status: LearningCanvasStatus
  nodeCount: number
  edgeCount: number
  refs: LearningCanvasRef[]
  sourceCanvasId: string | null
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface LearningCanvasWithId extends LearningCanvasRecord {
  id: string
}

export type LearningCanvasNodeType = 'text' | 'link' | 'reference' | 'group'
export type LearningCanvasColor = 'none' | 'navy' | 'tint' | 'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6'
export type LearningCanvasEdgeSide = 'top' | 'right' | 'bottom' | 'left'
export type LearningCanvasArrow = 'none' | 'to' | 'both'

export interface LearningCanvasNodeBase {
  id: string
  type: LearningCanvasNodeType
  x: number
  y: number
  width: number
  height: number
  color: LearningCanvasColor
}

export interface LearningCanvasTextNode extends LearningCanvasNodeBase {
  type: 'text'
  text: string
}

export interface LearningCanvasLinkNode extends LearningCanvasNodeBase {
  type: 'link'
  link: {
    url: string
    title: string
    note?: string
  }
}

export interface LearningCanvasReferenceNode extends LearningCanvasNodeBase {
  type: 'reference'
  reference: {
    refType: LearningCanvasRefType
    refId: string
  }
}

export interface LearningCanvasGroupNode extends LearningCanvasNodeBase {
  type: 'group'
  group: {
    label: string
  }
}

export type LearningCanvasNode =
  | LearningCanvasTextNode
  | LearningCanvasLinkNode
  | LearningCanvasReferenceNode
  | LearningCanvasGroupNode

export interface LearningCanvasEdge {
  id: string
  from: string
  to: string
  fromSide?: LearningCanvasEdgeSide
  toSide?: LearningCanvasEdgeSide
  label?: string
  arrow: LearningCanvasArrow
}

export interface LearningCanvasViewport {
  x: number
  y: number
  zoom: number
}

export interface LearningCanvasContent {
  version: 1
  nodes: LearningCanvasNode[]
  edges: LearningCanvasEdge[]
  viewport: LearningCanvasViewport
}

export interface CreateLearningCanvasInput {
  title: string
  description?: string
  kind: LearningCanvasKind
  initialContent?: Partial<LearningCanvasContent>
  sourceCanvasId?: string | null
}
