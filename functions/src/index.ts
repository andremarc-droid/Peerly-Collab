import { initializeApp } from 'firebase-admin/app'
import { FieldPath, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { isGraphOwner, parseGraphDeleteRequest } from './graphDeletionValidation.js'
import { fetchTranscriptForUser, TranscriptFailure, youtubeTimedTextProvider } from './youtubeTranscript.js'
import {
  cleanupStudyGroups as cleanupStudyGroupsHandler,
  createStudyGroup as createStudyGroupHandler,
  deleteStudyGroup as deleteStudyGroupHandler,
  joinStudyGroup as joinStudyGroupHandler,
  leaveStudyGroup as leaveStudyGroupHandler,
  previewStudyGroup as previewStudyGroupHandler,
  removeStudyGroupMember as removeStudyGroupMemberHandler,
  shareStudyItem as shareStudyItemHandler,
  unshareStudyItem as unshareStudyItemHandler,
} from './studyGroups.js'
import {
  advanceQuestion as advanceQuestionHandler,
  cleanupGames as cleanupGamesHandler,
  createGame as createGameHandler,
  deleteGame as deleteGameHandler,
  endGame as endGameHandler,
  joinGame as joinGameHandler,
  kickPlayer as kickPlayerHandler,
  startGame as startGameHandler,
  submitAnswer as submitAnswerHandler,
  syncGame as syncGameHandler,
} from './liveGames.js'
import {
  addTeamMember as addTeamMemberHandler,
  advanceTeam as advanceTeamHandler,
  cleanupGroupQuizData as cleanupGroupQuizDataHandler,
  createSelfTeam as createSelfTeamHandler,
  createTeam as createTeamHandler,
  deleteTeam as deleteTeamHandler,
  joinTeam as joinTeamHandler,
  leaveTeam as leaveTeamHandler,
  lockTeamAnswer as lockTeamAnswerHandler,
  overrideTeamQuestion as overrideTeamQuestionHandler,
  removeTeamMember as removeTeamMemberHandler,
  setRepresentative as setRepresentativeHandler,
  startTeamAttempt as startTeamAttemptHandler,
  submitTeamAnswer as submitTeamAnswerHandler,
  submitTeamAttempt as submitTeamAttemptHandler,
} from './groupQuizzes.js'
import { wrapGroupQuizHandler } from './groupQuizErrorMapping.js'

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
  { region: 'us-central1', cors: true, timeoutSeconds: 540, memory: '1GiB' },
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

export const fetchYoutubeTranscript = onCall({ region: 'us-central1', cors: true, timeoutSeconds: 30, memory: '256MiB' }, async call => {
  const limits = {
    async consume(uid: string, now: number, limit: number, windowMs: number): Promise<boolean> {
      const ref = db.doc(`youtubeTranscriptRateLimits/${uid}`)
      return db.runTransaction(async transaction => {
        const snapshot = await transaction.get(ref)
        const data = snapshot.data()
        const startedAt = data?.windowStartedAt?.toMillis?.() as number | undefined
        const count = typeof data?.count === 'number' ? data.count : 0
        if (!startedAt || now - startedAt >= windowMs || now < startedAt) {
          transaction.set(ref, { windowStartedAt: new Date(now), count: 1 })
          return true
        }
        if (count >= limit) return false
        transaction.update(ref, { count: count + 1 })
        return true
      })
    },
  }
  try {
    const result = await fetchTranscriptForUser(call.auth?.uid ?? null, call.data?.url, { provider: youtubeTimedTextProvider, limits })
    return result
  } catch (error) {
    if (error instanceof TranscriptFailure) throw new HttpsError(error.code, error.message)
    logger.error('Could not fetch YouTube transcript.', { error })
    throw new HttpsError('internal', 'Transcript import failed. Paste the transcript instead.')
  }
})

export const createStudyGroup = onCall({ region: 'us-central1', cors: true }, createStudyGroupHandler)
export const deleteStudyGroup = onCall({ region: 'us-central1', cors: true, timeoutSeconds: 540, memory: '1GiB' }, deleteStudyGroupHandler)
export const previewStudyGroup = onCall({ region: 'us-central1', cors: true }, previewStudyGroupHandler)
export const joinStudyGroup = onCall({ region: 'us-central1', cors: true }, joinStudyGroupHandler)
export const leaveStudyGroup = onCall({ region: 'us-central1', cors: true }, leaveStudyGroupHandler)
export const removeStudyGroupMember = onCall({ region: 'us-central1', cors: true }, removeStudyGroupMemberHandler)
export const cleanupStudyGroups = onCall({ region: 'us-central1', cors: true, timeoutSeconds: 540, memory: '1GiB' }, cleanupStudyGroupsHandler)
export const shareStudyItem = onCall({ region: 'us-central1', cors: true }, shareStudyItemHandler)
export const unshareStudyItem = onCall({ region: 'us-central1', cors: true }, unshareStudyItemHandler)

export const createGame = onCall({ region: 'us-central1', cors: true }, createGameHandler)
export const joinGame = onCall({ region: 'us-central1', cors: true }, joinGameHandler)
export const startGame = onCall({ region: 'us-central1', cors: true }, startGameHandler)
export const submitAnswer = onCall({ region: 'us-central1', cors: true }, submitAnswerHandler)
export const advanceQuestion = onCall({ region: 'us-central1', cors: true }, advanceQuestionHandler)
export const syncGame = onCall({ region: 'us-central1', cors: true }, syncGameHandler)
export const endGame = onCall({ region: 'us-central1', cors: true }, endGameHandler)
export const kickPlayer = onCall({ region: 'us-central1', cors: true }, kickPlayerHandler)
export const deleteGame = onCall({ region: 'us-central1', cors: true, timeoutSeconds: 120 }, deleteGameHandler)
export const cleanupGames = onCall({ region: 'us-central1', cors: true, timeoutSeconds: 300, memory: '512MiB' }, cleanupGamesHandler)

// Group quizzes: the only code that writes team, session and team result data.
export const createTeam = onCall({ region: 'us-central1', cors: true }, wrapGroupQuizHandler(createTeamHandler))
export const addTeamMember = onCall({ region: 'us-central1', cors: true }, wrapGroupQuizHandler(addTeamMemberHandler))
export const createSelfTeam = onCall({ region: 'us-central1', cors: true }, wrapGroupQuizHandler(createSelfTeamHandler))
export const joinTeam = onCall({ region: 'us-central1', cors: true }, wrapGroupQuizHandler(joinTeamHandler))
export const leaveTeam = onCall({ region: 'us-central1', cors: true }, wrapGroupQuizHandler(leaveTeamHandler))
export const removeTeamMember = onCall({ region: 'us-central1', cors: true }, wrapGroupQuizHandler(removeTeamMemberHandler))
export const setRepresentative = onCall({ region: 'us-central1', cors: true }, wrapGroupQuizHandler(setRepresentativeHandler))
export const deleteTeam = onCall({ region: 'us-central1', cors: true, timeoutSeconds: 120 }, wrapGroupQuizHandler(deleteTeamHandler))
export const startTeamAttempt = onCall({ region: 'us-central1', cors: true }, wrapGroupQuizHandler(startTeamAttemptHandler))
export const submitTeamAnswer = onCall({ region: 'us-central1', cors: true }, wrapGroupQuizHandler(submitTeamAnswerHandler))
export const lockTeamAnswer = onCall({ region: 'us-central1', cors: true }, wrapGroupQuizHandler(lockTeamAnswerHandler))
export const advanceTeam = onCall({ region: 'us-central1', cors: true }, wrapGroupQuizHandler(advanceTeamHandler))
export const overrideTeamQuestion = onCall({ region: 'us-central1', cors: true }, wrapGroupQuizHandler(overrideTeamQuestionHandler))
export const submitTeamAttempt = onCall({ region: 'us-central1', cors: true, timeoutSeconds: 120 }, wrapGroupQuizHandler(submitTeamAttemptHandler))
export const cleanupGroupQuizData = onCall({ region: 'us-central1', cors: true, timeoutSeconds: 300, memory: '512MiB' }, wrapGroupQuizHandler(cleanupGroupQuizDataHandler))
