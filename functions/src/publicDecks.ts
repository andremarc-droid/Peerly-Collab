import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'

export interface SavePublicDeckRequest {
  deckId: string
}

export interface SavePublicDeckResult {
  success: boolean
  savesCount: number
  alreadySaved?: boolean
}

export async function savePublicDeckHandler(
  call: CallableRequest<SavePublicDeckRequest>,
): Promise<SavePublicDeckResult> {
  if (!call.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to save a public deck.')
  }

  const deckId = call.data?.deckId
  if (typeof deckId !== 'string' || !deckId.trim()) {
    throw new HttpsError('invalid-argument', 'A valid deckId is required.')
  }

  const db = getFirestore()
  const uid = call.auth.uid
  const deckRef = db.doc(`publicDecks/${deckId}`)
  const saveRef = db.doc(`publicDeckSaves/${deckId}_${uid}`)

  return db.runTransaction(async transaction => {
    const deckSnap = await transaction.get(deckRef)
    if (!deckSnap.exists) {
      throw new HttpsError('not-found', 'This public deck does not exist or has been removed.')
    }

    const currentSaves = (deckSnap.data()?.savesCount as number | undefined) ?? 0

    const saveSnap = await transaction.get(saveRef)
    if (saveSnap.exists) {
      return { success: true, alreadySaved: true, savesCount: currentSaves }
    }

    transaction.set(saveRef, {
      deckId,
      userId: uid,
      savedAt: FieldValue.serverTimestamp(),
    })

    transaction.update(deckRef, {
      savesCount: FieldValue.increment(1),
    })

    return { success: true, savesCount: currentSaves + 1 }
  })
}
