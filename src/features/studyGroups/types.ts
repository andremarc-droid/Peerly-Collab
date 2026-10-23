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

export type StudyGroupActivityType = 'joined' | 'left' | 'deck_shared' | 'deck_studied'

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
