import { initializeApp } from 'firebase-admin/app'
import { FieldPath, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { isGraphOwner, parseGraphDeleteRequest } from './graphDeletionValidation.js'

initializeApp()

const db = getFirestore()
const INVITE_PAGE_SIZE = 500

interface DeleteSharedGraphRequest {
  classId: string
  graphId: string
}

function parseRequest(data: unknown): DeleteSharedGraphRequest {
  const request = parseGraphDeleteRequest(data)
  if (!request) {
    throw new HttpsError('invalid-argument', 'A valid class and graph view are required.')
  }
  return request
}

async function deleteGraphInviteCodes(classId: string, graphId: string, ownerId: string): Promise<void> {
  const inviteCodes = db.collection('learningInviteCodes')
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined

  while (true) {
    let pageQuery = inviteCodes
      .where('itemId', '==', graphId)
      .orderBy(FieldPath.documentId())
      .limit(INVITE_PAGE_SIZE)
    if (cursor) pageQuery = pageQuery.startAfter(cursor)
    const page = await pageQuery.get()
    if (page.empty) return

    const batch = db.batch()
    for (const invite of page.docs) {
      const data = invite.data()
      if (data.kind === 'graph' && data.classId === classId && data.ownerId === ownerId) {
        batch.delete(invite.ref)
      }
    }
    await batch.commit()
    cursor = page.docs[page.docs.length - 1]
    if (page.size < INVITE_PAGE_SIZE) return
  }
}

export const deleteSharedGraph = onCall(
  { region: 'us-central1', timeoutSeconds: 540, memory: '1GiB' },
  async (call) => {
    if (!call.auth) throw new HttpsError('unauthenticated', 'Sign in to delete a graph view.')
    const { classId, graphId } = parseRequest(call.data)
    const graphRef = db.doc(`classes/${classId}/graphViews/${graphId}`)
    const graph = await graphRef.get()
    if (!graph.exists) throw new HttpsError('not-found', 'This graph view no longer exists.')
    if (!isGraphOwner(graph.data(), classId, call.auth.uid)) {
      throw new HttpsError('permission-denied', 'Only the graph view owner can delete it.')
    }

    try {
      await deleteGraphInviteCodes(classId, graphId, call.auth.uid)
      await db.recursiveDelete(graphRef)
    } catch (error) {
      logger.error('Could not completely delete shared graph view.', {
        classId,
        graphId,
        ownerId: call.auth.uid,
        error,
      })
      throw new HttpsError('internal', 'The graph view could not be completely deleted. Please try again.')
    }
  },
)
