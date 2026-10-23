import {
  collection,
  doc,
  getCountFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { firestore } from '../../lib/firebase/firestore'
import { newCardId } from '../flashcards/schemas'
import { createDeck } from '../flashcards/services'
import { NOTE_NODE_ID, NOTE_SOURCE_ID } from '../learningCanvas/noteContent'
import { createCanvas } from '../learningCanvas/services'
import { createLessonPlan } from '../lessons/services'
import { MAX_GROUP_ITEMS, validateSharedItem } from './schemas'
import type {
  SharedCanvasPayload,
  SharedDeckPayload,
  SharedGroupItem,
  SharedItemKind,
  SharedItemPayload,
  SharedLessonPlanPayload,
  SharedNotePayload,
} from './types'

export async function shareItemWithGroup(
  groupId: string,
  itemInput: Omit<SharedGroupItem, 'sharedAt'>,
  actor: { uid: string; displayName?: string | null },
  db: Firestore = firestore,
): Promise<void> {
  const check = validateSharedItem(itemInput)
  if (!check.valid) throw new Error(check.error || 'Invalid item payload')

  const totalSnap = await getCountFromServer(collection(db, 'studyGroups', groupId, 'sharedItems'))
  if (totalSnap.data().count >= MAX_GROUP_ITEMS) {
    throw new Error(`This study group has reached the limit of ${MAX_GROUP_ITEMS} shared items.`)
  }

  const now = serverTimestamp()
  const actorName = actor.displayName?.trim() || 'Learner'
  const itemRef = doc(db, 'studyGroups', groupId, 'sharedItems', itemInput.id)

  const batch = writeBatch(db)
  batch.set(itemRef, {
    ...itemInput,
    sharedByUid: actor.uid,
    sharedByName: actorName,
    sharedAt: now,
  })

  const actRef = doc(collection(db, 'studyGroups', groupId, 'activity'))
  const kindLabel = itemInput.kind === 'lessonPlan' ? 'lesson plan' : itemInput.kind
  batch.set(actRef, {
    id: actRef.id,
    type: 'item_shared',
    actorUid: actor.uid,
    actorName,
    details: `shared the ${kindLabel} "${itemInput.title.trim().slice(0, 80)}"`,
    createdAt: now,
  })

  await batch.commit()
}

export async function updateSharedItem(
  groupId: string,
  itemId: string,
  updated: {
    title: string
    summary?: string
    payload: SharedItemPayload
    kind: SharedItemKind
  },
  actor: { uid: string; displayName?: string | null },
  db: Firestore = firestore,
): Promise<void> {
  const check = validateSharedItem({
    id: itemId,
    kind: updated.kind,
    title: updated.title,
    summary: updated.summary,
    payload: updated.payload,
    sharedByUid: actor.uid,
    sharedByName: actor.displayName || 'Learner',
    version: 2,
  })
  if (!check.valid) throw new Error(check.error || 'Invalid item update payload')

  const now = serverTimestamp()
  const actorName = actor.displayName?.trim() || 'Learner'
  const itemRef = doc(db, 'studyGroups', groupId, 'sharedItems', itemId)

  const batch = writeBatch(db)
  batch.update(itemRef, {
    title: updated.title.trim().slice(0, 120),
    summary: updated.summary?.trim().slice(0, 300) || '',
    payload: updated.payload,
    version: 2,
    sharedAt: now,
  })

  const actRef = doc(collection(db, 'studyGroups', groupId, 'activity'))
  const kindLabel = updated.kind === 'lessonPlan' ? 'lesson plan' : updated.kind
  batch.set(actRef, {
    id: actRef.id,
    type: 'item_updated',
    actorUid: actor.uid,
    actorName,
    details: `updated their shared ${kindLabel} "${updated.title.trim().slice(0, 80)}"`,
    createdAt: now,
  })

  await batch.commit()
}

export async function unshareItemFromGroup(
  groupId: string,
  itemId: string,
  itemKind: SharedItemKind,
  itemTitle: string,
  actor: { uid: string; displayName?: string | null },
  db: Firestore = firestore,
): Promise<void> {
  const batch = writeBatch(db)
  batch.delete(doc(db, 'studyGroups', groupId, 'sharedItems', itemId))
  if (itemKind === 'deck') {
    batch.delete(doc(db, 'studyGroups', groupId, 'sharedDecks', itemId))
  }

  const actRef = doc(collection(db, 'studyGroups', groupId, 'activity'))
  const kindLabel = itemKind === 'lessonPlan' ? 'lesson plan' : itemKind
  const actorName = actor.displayName?.trim() || 'Learner'
  batch.set(actRef, {
    id: actRef.id,
    type: 'item_unshared',
    actorUid: actor.uid,
    actorName,
    details: `removed the ${kindLabel} "${itemTitle.trim().slice(0, 80)}"`,
    createdAt: serverTimestamp(),
  })

  await batch.commit()
}

export function subscribeGroupSharedItems(
  groupId: string,
  kind: SharedItemKind | 'all',
  onNext: (items: SharedGroupItem[]) => void,
  onError: (error: Error) => void,
  limitCount = 50,
  db: Firestore = firestore,
): () => void {
  const col = collection(db, 'studyGroups', groupId, 'sharedItems')
  let q = query(col, orderBy('sharedAt', 'desc'), limit(limitCount))
  if (kind !== 'all') {
    q = query(col, where('kind', '==', kind), orderBy('sharedAt', 'desc'), limit(limitCount))
  }

  let itemsMap = new Map<string, SharedGroupItem>()

  const unsubItems = onSnapshot(
    q,
    (snap) => {
      itemsMap = new Map(snap.docs.map((d) => [d.id, d.data() as SharedGroupItem]))
      emit()
    },
    onError,
  )

  let unsubDecks = () => {}
  if (kind === 'all' || kind === 'deck') {
    const decksQ = query(
      collection(db, 'studyGroups', groupId, 'sharedDecks'),
      orderBy('sharedAt', 'desc'),
      limit(limitCount),
    )
    unsubDecks = onSnapshot(
      decksQ,
      (snap) => {
        snap.docs.forEach((d) => {
          if (!itemsMap.has(d.id)) {
            const data = d.data()
            itemsMap.set(d.id, {
              id: d.id,
              kind: 'deck',
              title: data.title,
              summary: data.description,
              payload: {
                cardCount: data.cardCount,
                cards: data.cards,
                sourceClassId: data.sourceClassId,
              },
              sharedByUid: data.sharedByUid,
              sharedByName: data.sharedByName,
              sharedAt: data.sharedAt,
              version: 1,
            })
          }
        })
        emit()
      },
      () => {},
    )
  }

  function emit() {
    const list = Array.from(itemsMap.values()).sort((a, b) => {
      const ta = (a.sharedAt as any)?.toMillis?.() ?? 0
      const tb = (b.sharedAt as any)?.toMillis?.() ?? 0
      return tb - ta
    })
    onNext(list)
  }

  return () => {
    unsubItems()
    unsubDecks()
  }
}

export async function copySharedItemToLibrary(
  item: SharedGroupItem,
  userUid: string,
  db: Firestore = firestore,
): Promise<string> {
  const copyTitle = `${item.title} (Copy)`.slice(0, 120)
  const attribution = item.summary
    ? `${item.summary}\n\n(Copied from study group item shared by ${item.sharedByName})`.slice(0, 300)
    : `(Copied from study group item shared by ${item.sharedByName})`.slice(0, 300)

  switch (item.kind) {
    case 'deck': {
      const payload = item.payload as SharedDeckPayload
      const clonedCards = payload.cards.map((c) => ({
        id: newCardId(),
        front: c.front,
        back: c.back,
      }))
      return await createDeck(
        'personal',
        userUid,
        'personal',
        {
          title: copyTitle,
          description: attribution,
          cards: clonedCards,
          published: false,
        },
        db,
      )
    }
    case 'canvas': {
      const payload = item.payload as SharedCanvasPayload
      const safeNodes = (payload.nodes || []).map((n: any, idx: number) => ({
        id: String(n.id || `node-${idx}`),
        type: n.type || 'text',
        x: typeof n.x === 'number' ? n.x : (idx % 3) * 220,
        y: typeof n.y === 'number' ? n.y : Math.floor(idx / 3) * 150,
        width: typeof n.width === 'number' ? n.width : 200,
        height: typeof n.height === 'number' ? n.height : 120,
        color: n.color || 'none',
        ...n,
      }))
      return await createCanvas(
        payload.sourceClassId || 'personal',
        userUid,
        {
          kind: 'personal',
          title: copyTitle,
          description: attribution,
          initialContent: {
            version: 1,
            nodes: safeNodes,
            edges: payload.edges || [],
            viewport: payload.viewport || { x: 0, y: 0, zoom: 1 },
          },
        },
        db,
      )
    }
    case 'lessonPlan': {
      const payload = item.payload as SharedLessonPlanPayload
      const formattedLessons: Record<string, any> = {}
      for (const [id, les] of Object.entries(payload.lessons)) {
        formattedLessons[id] = {
          title: les.title,
          objective: les.objective,
          content: les.content,
          keyPoints: les.keyPoints || [],
          flashcards: (les.flashcards || []).map((f) => ({ id: f.id, front: f.front, back: f.back })),
          quiz: les.quiz || [],
        }
      }
      const plan = await createLessonPlan(
        userUid,
        {
          outline: {
            title: copyTitle,
            lessons: payload.order.map((id) => ({
              id,
              title: payload.lessons[id]?.title || 'Lesson',
              objective: payload.lessons[id]?.objective || '',
            })),
          },
          topic: payload.topic,
          level: payload.level as any,
          lessons: formattedLessons,
          status: 'ready',
        },
        db,
      )
      return plan.id
    }
    case 'note': {
      const payload = item.payload as SharedNotePayload
      return await createCanvas(
        payload.sourceClassId || 'personal',
        userUid,
        {
          kind: 'personal',
          title: copyTitle,
          description: (item.summary || payload.text).slice(0, 300),
          sourceCanvasId: NOTE_SOURCE_ID,
          initialContent: {
            version: 1,
            nodes: [
              {
                id: NOTE_NODE_ID,
                type: 'text',
                x: 0,
                y: 0,
                width: 380,
                height: 240,
                color: 'none',
                text: payload.text,
              },
            ],
            edges: [],
            viewport: { x: 0, y: 0, zoom: 1 },
          },
        },
        db,
      )
    }
    default:
      throw new Error(`Unsupported item kind: ${(item as any).kind}`)
  }
}
