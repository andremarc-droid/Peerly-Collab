import { collection, collectionGroup, doc, type Firestore } from 'firebase/firestore'

export const tutorThreadRef = (db: Firestore, threadId: string) =>
  doc(db, 'sharedTutorThreads', threadId)

export const tutorThreadsRef = (db: Firestore) =>
  collection(db, 'sharedTutorThreads')

export const tutorMembersRef = (db: Firestore, threadId: string) =>
  collection(db, 'sharedTutorThreads', threadId, 'tutorMembers')

export const tutorMemberRef = (db: Firestore, threadId: string, uid: string) =>
  doc(db, 'sharedTutorThreads', threadId, 'tutorMembers', uid)

export const tutorInvitesRef = (db: Firestore, threadId: string) =>
  collection(db, 'sharedTutorThreads', threadId, 'invites')

export const tutorInviteRef = (db: Firestore, threadId: string, token: string) =>
  doc(db, 'sharedTutorThreads', threadId, 'invites', token)

export const tutorMessagesRef = (db: Firestore, threadId: string) =>
  collection(db, 'sharedTutorThreads', threadId, 'messages')

export const tutorMessageRef = (db: Firestore, threadId: string, messageId: string) =>
  doc(db, 'sharedTutorThreads', threadId, 'messages', messageId)

export const tutorImageRef = (db: Firestore, threadId: string, messageId: string, imageId: string) =>
  doc(db, 'sharedTutorThreads', threadId, 'messages', messageId, 'images', imageId)

export const tutorActivityRef = (db: Firestore, threadId: string) =>
  collection(db, 'sharedTutorThreads', threadId, 'activity')

export const tutorPresenceCollectionRef = (db: Firestore, threadId: string) =>
  collection(db, 'sharedTutorThreads', threadId, 'presence')

export const tutorPresenceRef = (db: Firestore, threadId: string, uid: string) =>
  doc(db, 'sharedTutorThreads', threadId, 'presence', uid)

export const tutorRevokedInviteRef = (db: Firestore, threadId: string, uid: string, token: string) =>
  doc(db, 'sharedTutorThreads', threadId, 'revokedAccess', uid, 'invites', token)

export const tutorMembersGroupRef = (db: Firestore) => collectionGroup(db, 'tutorMembers')
