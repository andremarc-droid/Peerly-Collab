import type { Timestamp } from 'firebase/firestore'
import type { FlashcardDeckRecord } from '../flashcards/types'
import type { LearningCanvasContent, LearningCanvasRecord } from '../learningCanvas/types'
import type { LessonPlanRecord, LessonRecord } from '../lessons/types'

export interface StudyGroupRecord {
  name: string
  description: string
  ownerId: string
  memberCount: number
  createdAt: Timestamp
  updatedAt: Timestamp
  joinCode: string
  joiningOpen: boolean
}
export interface StudyGroup extends StudyGroupRecord { id: string }

export interface StudyGroupMemberRecord {
  role: 'owner' | 'member'
  displayName: string
  joinedAt: Timestamp
}
export interface StudyGroupMember extends StudyGroupMemberRecord { uid: string }

export type GroupShareKind = 'lessonPlan' | 'deck' | 'canvas'
export interface GroupShareRecord {
  kind: GroupShareKind
  ownerId: string
  title: string
  snapshotPath: string
  sharedAt: Timestamp
}
export interface GroupShare extends GroupShareRecord { id: string }

export interface GroupLessonSnapshot {
  kind: 'lessonPlan'
  ownerId: string
  sourceId: string
  sourceClassId: null
  title: string
  data: LessonPlanRecord
  createdAt: Timestamp
}
export interface GroupDeckSnapshot {
  kind: 'deck'
  ownerId: string
  sourceId: string
  sourceClassId: string
  title: string
  data: FlashcardDeckRecord
  createdAt: Timestamp
}
export interface GroupCanvasSnapshot {
  kind: 'canvas'
  ownerId: string
  sourceId: string
  sourceClassId: string
  title: string
  data: LearningCanvasRecord
  createdAt: Timestamp
}
export type GroupSnapshot = GroupLessonSnapshot | GroupDeckSnapshot | GroupCanvasSnapshot
export type GroupSnapshotContent = { lessonPlan: GroupLessonSnapshot & { lessons: Record<string, LessonRecord> } }
  | { deck: GroupDeckSnapshot }
  | { canvas: GroupCanvasSnapshot & { content: LearningCanvasContent } }

export interface GroupMembershipIndex {
  groupId: string
  role: 'owner' | 'member'
  joinedAt: Timestamp
}
export interface GroupStateRecord { ownedCount: number; joinedCount: number }
export interface GroupPreview { id: string; name: string; description: string; memberCount: number; joiningOpen: boolean }
