import type { Timestamp } from 'firebase/firestore'

export type StudyGroupPrivacy = 'public' | 'private'

export interface StudyGroup {
  id: string
  name: string
  description?: string
  privacy: StudyGroupPrivacy
  ownerId: string
  ownerDisplayName: string
  inviteCode: string
  memberCount: number
  maxMembers: number
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface StudyGroupMember {
  uid: string
  displayName: string
  role: 'owner' | 'member'
  joinedAt: Timestamp
}

export type SharedItemKind = 'deck' | 'canvas' | 'lessonPlan' | 'note'

export interface SharedDeckPayload {
  cardCount: number
  cards: Array<{ id: string; front: string; back: string }>
  sourceClassId?: string
}

export interface SharedCanvasPayload {
  nodeCount: number
  edgeCount: number
  nodes: Array<any>
  edges: Array<any>
  viewport?: { x: number; y: number; zoom: number }
  sourceClassId?: string
}

export interface SharedLessonPlanPayload {
  topic: string
  level: string
  lessonCount: number
  order: string[]
  lessons: Record<
    string,
    {
      title: string
      objective: string
      content: string
      keyPoints: string[]
      flashcards?: Array<{ id: string; front: string; back: string }>
      quiz?: any[]
    }
  >
}

export interface SharedNotePayload {
  text: string
  sourceClassId?: string
}

export type SharedItemPayload =
  | SharedDeckPayload
  | SharedCanvasPayload
  | SharedLessonPlanPayload
  | SharedNotePayload

export interface SharedGroupItem {
  id: string
  kind: SharedItemKind
  title: string
  summary?: string
  payload: SharedItemPayload
  sharedByUid: string
  sharedByName: string
  sharedAt: Timestamp
  version: number
  originalItemId?: string
}

export interface SharedGroupDeck {
  id: string
  deckId: string
  sourceClassId: string
  title: string
  description: string
  cardCount: number
  cards: Array<{ id: string; front: string; back: string }>
  sharedByUid: string
  sharedByName: string
  sharedAt: Timestamp
}

export type StudyGroupActivityType =
  | 'joined'
  | 'left'
  | 'deck_shared'
  | 'deck_studied'
  | 'item_shared'
  | 'item_updated'
  | 'item_unshared'
  | 'item_studied'

export interface StudyGroupActivity {
  id: string
  type: StudyGroupActivityType
  actorUid: string
  actorName: string
  details: string
  createdAt: Timestamp
}

export interface CreateStudyGroupInput {
  name: string
  description?: string
  privacy: StudyGroupPrivacy
}

export interface JoinStudyGroupResult {
  success: boolean
  groupId: string
  groupName: string
  alreadyMember?: boolean
}
