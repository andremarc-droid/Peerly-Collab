import { initializeApp } from 'firebase-admin/app'
import { FieldPath, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { isGraphOwner, parseGraphDeleteRequest } from './graphDeletionValidation.js'
import { savePublicDeckHandler } from './publicDecks.js'
import {
  joinStudyGroupHandler,
  leaveStudyGroupHandler,
  removeStudyGroupMemberHandler,
} from './studyGroups.js'
import {
  ensureScoreboardEntryHandler,
  updateScoreboardOptInHandler,
  syncStatsSummaryToScoreboardHandler,
  syncUserToScoreboardHandler,
  resetWeeklyScoreboardHandler,
} from './scoreboard.js'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
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

export const savePublicDeck = onCall({ region: 'us-central1', cors: true }, savePublicDeckHandler)

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

export const joinStudyGroup = onCall({ region: 'us-central1', cors: true }, joinStudyGroupHandler)
export const leaveStudyGroup = onCall({ region: 'us-central1', cors: true }, leaveStudyGroupHandler)
export const removeStudyGroupMember = onCall({ region: 'us-central1', cors: true }, removeStudyGroupMemberHandler)

export const ensureScoreboardEntry = onCall({ region: 'us-central1', cors: true }, ensureScoreboardEntryHandler)
export const updateScoreboardOptIn = onCall({ region: 'us-central1', cors: true }, updateScoreboardOptInHandler)
export const syncStatsSummaryToScoreboard = onDocumentWritten(
  { document: 'users/{uid}/stats/summary', region: 'us-central1' },
  syncStatsSummaryToScoreboardHandler,
)
export const syncUserToScoreboard = onDocumentWritten(
  { document: 'users/{userId}', region: 'us-central1' },
  syncUserToScoreboardHandler,
)
export const resetWeeklyScoreboard = onSchedule(
  { schedule: '0 0 * * 0', timeZone: 'UTC', region: 'us-central1' },
  async () => {
    await resetWeeklyScoreboardHandler()
  },
)
