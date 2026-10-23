import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { firestore } from '../../lib/firebase/firestore'
import { callServer } from '../../lib/firebase/callServer'
import { newCardId } from '../flashcards/schemas'
import { createDeck } from '../flashcards/services'
import type { FlashcardDeckWithId } from '../flashcards/types'
import { parseTags, validatePublicCards } from './schemas'
import type { PublicDeck, PublicDeckFilter, PublicDeckReportInput } from './types'

export async function publishPublicDeck(
  deck: FlashcardDeckWithId,
  authorDisplayName: string,
  rawTags: string,
  db: Firestore = firestore,
): Promise<void> {
  const check = validatePublicCards(deck.cards)
  if (!check.valid) throw new Error(check.error)

  const tags = parseTags(rawTags)
  const name = authorDisplayName.trim().slice(0, 80) || 'Anonymous'

  const ref = doc(db, 'publicDecks', deck.id)
  const existing = await getDoc(ref)
  const now = serverTimestamp()

  const data = {
    id: deck.id,
    ownerId: deck.ownerId,
    authorDisplayName: name,
    title: deck.title.trim().slice(0, 120),
    description: deck.description.trim().slice(0, 300),
    tags,
    cardCount: deck.cards.length,
    cards: deck.cards.map(c => ({
      id: c.id,
      front: c.front.trim().slice(0, 300),
      back: c.back.trim().slice(0, 600),
    })),
    savesCount: existing.exists() ? existing.data()?.savesCount ?? 0 : 0,
    publishedAt: existing.exists() ? existing.data()?.publishedAt ?? now : now,
    updatedAt: now,
  }

  await setDoc(ref, data)
}

export async function unpublishPublicDeck(deckId: string, db: Firestore = firestore): Promise<void> {
  await deleteDoc(doc(db, 'publicDecks', deckId))
}

export async function checkIsPublic(deckId: string, db: Firestore = firestore): Promise<boolean> {
  const snap = await getDoc(doc(db, 'publicDecks', deckId))
  return snap.exists()
}

export async function listPublicDecks(
  filter: PublicDeckFilter = {},
  maxResults = 50,
  db: Firestore = firestore,
): Promise<PublicDeck[]> {
  const col = collection(db, 'publicDecks')
  const sortField = filter.sortBy === 'mostSaved' ? 'savesCount' : 'publishedAt'

  let q = query(col, orderBy(sortField, 'desc'), limit(maxResults))
  if (filter.tag) {
    q = query(col, where('tags', 'array-contains', filter.tag.toLowerCase()), orderBy(sortField, 'desc'), limit(maxResults))
  }

  const snap = await getDocs(q)
  return snap.docs.map(d => d.data() as PublicDeck)
}

export async function copyPublicDeckToLibrary(
  deck: PublicDeck,
  userUid: string,
): Promise<string> {
  const clonedCards = deck.cards.map(c => ({
    id: newCardId(),
    front: c.front,
    back: c.back,
  }))

  const attributionDesc = deck.description
    ? `${deck.description}\n\n(Copied from "${deck.title}" by ${deck.authorDisplayName})`
    : `(Copied from "${deck.title}" by ${deck.authorDisplayName})`

  const newDeckId = await createDeck(userUid, userUid, 'personal', {
    title: deck.title,
    description: attributionDesc.slice(0, 300),
    cards: clonedCards,
    published: false,
  })

  try {
    await callServer<{ deckId: string }, { success: boolean; savesCount: number }>('savePublicDeck', { deckId: deck.id })
  } catch {
    // Non-blocking: failure to increment the counter should not break the user's copy
  }

  return newDeckId
}

export async function reportPublicDeck(
  input: PublicDeckReportInput,
  reporterUid: string,
  db: Firestore = firestore,
): Promise<void> {
  const reportRef = doc(collection(db, 'publicDeckReports'))
  await setDoc(reportRef, {
    deckId: input.deckId,
    reportedBy: reporterUid,
    reason: input.reason,
    note: (input.note ?? '').trim().slice(0, 500),
    createdAt: serverTimestamp(),
  })
}

export async function deleteMyPublicDecks(ownerId: string, db: Firestore = firestore): Promise<void> {
  const q = query(collection(db, 'publicDecks'), where('ownerId', '==', ownerId))
  const snap = await getDocs(q)
  if (snap.empty) return
  const batch = writeBatch(db)
  for (const item of snap.docs) {
    batch.delete(item.ref)
  }
  await batch.commit()
}
