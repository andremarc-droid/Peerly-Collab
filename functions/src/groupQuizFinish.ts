import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'
import { GroupQuizError, nextTeamStatus } from './groupQuizLogic.js'
import { gradeTeam, type GradableKey, type GradableQuestion } from './groupQuizGrading.js'
import { parseEmptyRequest, parseTeamRef } from './groupQuizRequests.js'
import {
  RATE, assertMember, authedUid, db, enforceRate, guarded, membershipsCollection, participantRef, privateRef, quizRef, readPrivate, readQuiz, readSession, readTeam,
  revealRef, sessionRef, teamRef,
} from './groupQuizData.js'
import { correctAnswerOf, isPlayableType, readKey } from './groupQuizSession.js'
import { removeFromTeam } from './groupQuizTeams.js'

/** Firestore allows 500 writes per transaction. Members and bookkeeping use well under 50, so this many reveals always fit. */
const MAX_REVEAL_WRITES = 400

/** Finishing a team attempt and cleaning up a deleted account. Grading happens here, once, with the answer keys the browser never sees. */

export async function submitTeamAttempt(call: CallableRequest<unknown>) {
  const uid = authedUid(call)
  return guarded(async () => {
    const request = parseTeamRef(call.data)
    await enforceRate(uid, 'manage', RATE.manage)
    return db().runTransaction(async tx => {
      const [quizSnap, teamSnap, sessionSnap, privSnap, questionsSnap, keysSnap] = await Promise.all([
        tx.get(quizRef(request.quizId)), tx.get(teamRef(request.quizId, request.teamId)), tx.get(sessionRef(request.quizId, request.teamId)), tx.get(privateRef(request.quizId, request.teamId)),
        tx.get(db().collection(`quizzes/${request.quizId}/questions`)), tx.get(db().collection(`quizzes/${request.quizId}/answerKeys`)),
      ])
      const quiz = readQuiz(quizSnap)
      const team = readTeam(teamSnap)
      if (quiz.ownerId !== uid) assertMember(team, uid)
      if (team.status === 'submitted') {
        const scored = team as typeof team & { score?: number; maxScore?: number }
        return { alreadySubmitted: true, score: scored.score ?? null, maxScore: scored.maxScore ?? null }
      }
      if (team.status !== 'in_progress') throw new GroupQuizError('This team has not started the quiz.', 'failed-precondition')
      if (readSession(sessionSnap).phase !== 'finished') throw new GroupQuizError('Finish every question before submitting.', 'failed-precondition')
      const priv = readPrivate(privSnap)

      const questionDocs = new Map(questionsSnap.docs.map(doc => [doc.id, doc]))
      const keyDocs = new Map(keysSnap.docs.map(doc => [doc.id, doc]))
      const questions: GradableQuestion[] = []
      const keys: Record<string, GradableKey> = {}
      for (const id of priv.questionOrder) {
        const doc = questionDocs.get(id)
        if (!doc || !isPlayableType(doc.get('type')) || typeof doc.get('points') !== 'number') continue
        questions.push({ id, type: doc.get('type'), points: doc.get('points') })
        const keyDoc = keyDocs.get(id)
        if (keyDoc) keys[id] = readKey(keyDoc)
      }
      const graded = gradeTeam(questions, keys, priv.finalAnswers)
      const participants = await Promise.all(team.memberIds.map(id => tx.get(participantRef(request.quizId, id))))

      const nowMs = Date.now()
      const timeSpentSeconds = Math.max(0, Math.floor((nowMs - priv.startedAtMs) / 1000))
      const perQuestion = Object.fromEntries(Object.entries(graded.perQuestion).map(([id, grade]) => [id, { correct: grade.correct, pointsAwarded: grade.pointsAwarded, overridden: false }]))
      const attempts = db().collection(`quizzes/${request.quizId}/attempts`)
      team.memberIds.forEach((memberId, index) => {
        const participant = participants[index]
        const attemptCount = typeof participant?.get('attemptCount') === 'number' ? (participant.get('attemptCount') as number) : 0
        const userName = team.memberNames[memberId] ?? 'Student'
        const attempt = attempts.doc()
        tx.set(attempt, {
          userId: memberId, userName, attemptNumber: attemptCount + 1, status: 'submitted', answers: priv.finalAnswers, questionOrder: priv.questionOrder,
          optionOrder: priv.optionOrder, startedAt: Timestamp.fromMillis(priv.startedAtMs), submittedAt: FieldValue.serverTimestamp(), timeSpentSeconds,
          teamId: request.teamId, teamName: team.name,
        })
        tx.set(db().doc(`quizzes/${request.quizId}/results/${attempt.id}`), { userId: memberId, score: graded.score, maxScore: graded.maxScore, perQuestion, gradedAt: FieldValue.serverTimestamp() })
        tx.set(participantRef(request.quizId, memberId), {
          userId: memberId, userName, createdAt: participant?.exists ? participant.get('createdAt') : FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
          attemptCount: attemptCount + 1, activeAttemptId: null,
        })
      })

      // Students never read answer keys of a group quiz. When the quiz reveals answers only after submitting, the team
      // learns them here: each reveal document (written when its question closed) now also gets the graded result.
      // With "after each question" the result was already added at that time, and with "never" nothing is revealed.
      if (quiz.answerReveal === 'after_submit' && priv.questionOrder.length <= MAX_REVEAL_WRITES) {
        priv.questionOrder.forEach((questionId, index) => {
          const key = keys[questionId]
          const grade = graded.perQuestion[questionId]
          if (!key || !grade) return
          tx.set(revealRef(request.quizId, request.teamId, index), {
            result: { correct: grade.correct, pointsAwarded: grade.pointsAwarded, correctAnswer: correctAnswerOf(key), explanation: key.explanation },
          }, { merge: true })
        })
      }

      tx.update(teamRef(request.quizId, request.teamId), { status: nextTeamStatus('in_progress', 'submitted'), score: graded.score, maxScore: graded.maxScore, submittedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
      return { alreadySubmitted: false, score: graded.score, maxScore: graded.maxScore }
    })
  })
}

/** Called by account deletion: takes the user off every team and clears their group quiz bookkeeping. Safe to call again after a failure. */
export async function cleanupGroupQuizData(call: CallableRequest<unknown>) {
  const uid = authedUid(call)
  return guarded(async () => {
    parseEmptyRequest(call.data)
    let removed = 0
    for (let round = 0; round < 20; round += 1) {
      const page = await membershipsCollection(uid).limit(25).get()
      if (page.empty) break
      for (const membership of page.docs) {
        const quizId: unknown = membership.get('quizId')
        const teamId: unknown = membership.get('teamId')
        if (typeof quizId !== 'string' || typeof teamId !== 'string') { await membership.ref.delete(); continue }
        try {
          await removeFromTeam(quizId, teamId, uid, () => undefined)
          removed += 1
        } catch (error) {
          if (error instanceof GroupQuizError && error.code === 'not-found') { await membership.ref.delete(); continue }
          throw error
        }
      }
    }
    await db().doc(`groupQuizRateLimits/${uid}`).delete()
    return { removed }
  })
}
