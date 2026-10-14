import { FieldValue, type Transaction } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'
import {
  GroupQuizError, assertCanStart, assertCanSubmit, autoAnswer, buildQuestionOrder, canAdvanceReview, canLockAnswer, isTimeUp, nextTeamStatus, validateAnswer,
  type Answer,
} from './groupQuizLogic.js'
import { parseAnswerRequest, parseQuestionStep, parseStartTeam } from './groupQuizRequests.js'
import {
  RATE, assertMember, assertPlayable, authedUid, db, enforceRate, guarded, participantRef, privateRef, quizRef, readPrivate, readQuiz, readSession, readTeam,
  revealRef, sessionRef, teamRef,
  type PrivateData, type QuizInfo, type SessionData, type TeamData,
} from './groupQuizData.js'
import { buildReveal, finishedSessionFields, isPlayableType, openSessionFields, readKey, toSessionQuestion } from './groupQuizSession.js'

/** The play loop. Every pacing rule (waiting, timers, who may answer) is enforced here, never in the browser. */

const questionDoc = (quizId: string, id: string) => db().doc(`quizzes/${quizId}/questions/${id}`)
const keyDoc = (quizId: string, id: string) => db().doc(`quizzes/${quizId}/answerKeys/${id}`)
const countOf = (team: TeamData, flags: Record<string, true>): number => team.memberIds.filter(id => flags[id]).length

interface PlayContext {
  quizId: string
  teamId: string
  quiz: QuizInfo
  team: TeamData
  session: SessionData
  priv: PrivateData
  key: ReturnType<typeof readKey> | null
}

async function loadPlay(tx: Transaction, quizId: string, teamId: string): Promise<PlayContext> {
  const [quizSnap, teamSnap, sessionSnap, privSnap] = await Promise.all([tx.get(quizRef(quizId)), tx.get(teamRef(quizId, teamId)), tx.get(sessionRef(quizId, teamId)), tx.get(privateRef(quizId, teamId))])
  const quiz = readQuiz(quizSnap)
  const team = readTeam(teamSnap)
  if (team.status !== 'in_progress') throw new GroupQuizError('This team is not taking the quiz right now.', 'failed-precondition')
  assertPlayable(quiz)
  const session = readSession(sessionSnap)
  const priv = readPrivate(privSnap)
  const key = session.question && quiz.answerReveal === 'after_each' ? readKey(await tx.get(keyDoc(quizId, session.question.id))) : null
  return { quizId, teamId, quiz, team, session, priv, key }
}

/** Closes the open question: stores the team's final answer, writes the reveal, and moves the session to review. Writes only. */
function closeQuestion(tx: Transaction, ctx: PlayContext, closing: { final: Answer | null; lockedBy: string | null; auto: boolean; answered?: Record<string, true> }, nowMs: number): void {
  const question = ctx.session.question
  if (!question) throw new GroupQuizError('This question is not open.', 'failed-precondition')
  const picks = ctx.priv.picks[question.id] ?? {}
  const finalAnswers = closing.final === null ? ctx.priv.finalAnswers : { ...ctx.priv.finalAnswers, [question.id]: closing.final }
  // Picks of a closed question live on in the reveal document, so the private document only ever holds the open question's picks.
  tx.update(privateRef(ctx.quizId, ctx.teamId), { picks: {}, finalAnswers })
  tx.set(revealRef(ctx.quizId, ctx.teamId, question.index), buildReveal({ quiz: ctx.quiz, question, key: ctx.key, finalAnswer: closing.final, picks, lockedBy: closing.lockedBy, auto: closing.auto }))
  tx.update(sessionRef(ctx.quizId, ctx.teamId), {
    phase: 'review', locked: true, reviewStartedAt: nowMs, ready: {}, answered: closing.answered ?? ctx.session.answered,
    picks: ctx.quiz.settings.answerMode === 'everyone' ? picks : null, updatedAt: FieldValue.serverTimestamp(),
  })
}

// ---- start ------------------------------------------------------------------------------------------------------

export async function startTeamAttempt(call: CallableRequest<unknown>) {
  const uid = authedUid(call)
  return guarded(async () => {
    const request = parseStartTeam(call.data)
    await enforceRate(uid, 'manage', RATE.manage)
    await db().runTransaction(async tx => {
      const [quizSnap, teamSnap, questionsSnap] = await Promise.all([
        tx.get(quizRef(request.quizId)), tx.get(teamRef(request.quizId, request.teamId)), tx.get(db().collection(`quizzes/${request.quizId}/questions`).orderBy('order')),
      ])
      const quiz = readQuiz(quizSnap)
      assertPlayable(quiz)
      const team = readTeam(teamSnap)
      if (quiz.ownerId !== uid) {
        assertMember(team, uid)
        if (request.force) throw new GroupQuizError('Only your instructor can start a team that is not full enough.', 'permission-denied')
      }
      assertCanStart({ memberCount: team.memberIds.length, groupSize: quiz.settings.groupSize, status: team.status, force: request.force })
      if (questionsSnap.empty) throw new GroupQuizError('This quiz has no questions yet.', 'failed-precondition')
      if (questionsSnap.docs.some(doc => !isPlayableType(doc.get('type')))) throw new GroupQuizError('This quiz has questions that teams cannot answer.', 'failed-precondition')
      const participants = await Promise.all(team.memberIds.map(id => tx.get(participantRef(request.quizId, id))))
      participants.forEach((snap, index) => {
        const attemptCount = typeof snap.get('attemptCount') === 'number' ? (snap.get('attemptCount') as number) : 0
        if (quiz.attemptsAllowed !== null && attemptCount >= quiz.attemptsAllowed) {
          const id = team.memberIds[index] ?? ''
          throw new GroupQuizError(`${team.memberNames[id] ?? 'A teammate'} has no attempts left for this quiz.`, 'failed-precondition')
        }
      })
      const docs = questionsSnap.docs
      const questionOrder = buildQuestionOrder(docs.map(doc => doc.id), quiz.shuffleQuestions)
      const optionOrder: Record<string, string[]> = {}
      for (const doc of docs) {
        const options = Array.isArray(doc.get('options')) ? (doc.get('options') as Array<{ id: string }>).map(option => option.id) : []
        if (options.length > 0) optionOrder[doc.id] = buildQuestionOrder(options, quiz.shuffleOptions)
      }
      const firstId = questionOrder[0] as string
      const first = toSessionQuestion(docs.find(doc => doc.id === firstId)!, 0, optionOrder[firstId])
      const now = Date.now()
      const ready = team.status === 'forming' ? nextTeamStatus('forming', 'ready') : team.status
      tx.set(privateRef(request.quizId, request.teamId), { questionOrder, optionOrder, picks: {}, finalAnswers: {}, startedAtMs: now })
      tx.set(sessionRef(request.quizId, request.teamId), openSessionFields(first, questionOrder.length, quiz, now))
      tx.update(teamRef(request.quizId, request.teamId), { status: nextTeamStatus(ready, 'in_progress'), startedAt: now, updatedAt: FieldValue.serverTimestamp() })
    })
    return { ok: true }
  })
}

// ---- answering --------------------------------------------------------------------------------------------------

export async function submitTeamAnswer(call: CallableRequest<unknown>) {
  const uid = authedUid(call)
  return guarded(async () => {
    const request = parseAnswerRequest(call.data)
    await enforceRate(uid, 'play', RATE.play)
    await db().runTransaction(async tx => {
      const ctx = await loadPlay(tx, request.quizId, request.teamId)
      const { quiz, team, session, priv } = ctx
      const now = Date.now()
      assertCanSubmit({
        answerMode: quiz.settings.answerMode, uid, memberIds: team.memberIds, representativeId: team.representativeId, phase: session.phase,
        currentIndex: session.currentIndex, questionIndex: request.questionIndex, endsAtMs: session.questionEndsAt, nowMs: now,
      })
      const question = session.question
      if (!question) throw new GroupQuizError('This question is not open.', 'failed-precondition')
      if (session.locked || session.answered[uid]) throw new GroupQuizError('You already answered this question.', 'failed-precondition')
      const answer = validateAnswer({ type: question.type, prompt: question.prompt, options: question.options.map(option => option.id) }, request.answer)
      const picks = { ...(priv.picks[question.id] ?? {}), [uid]: answer }
      const answered: Record<string, true> = { ...session.answered, [uid]: true }
      if (quiz.settings.answerMode === 'representative') {
        closeQuestion(tx, { ...ctx, priv: { ...priv, picks: { ...priv.picks, [question.id]: picks } } }, { final: answer, lockedBy: uid, auto: false, answered }, now)
        return
      }
      tx.update(privateRef(request.quizId, request.teamId), { picks: { ...priv.picks, [question.id]: picks } })
      // Teammates see each other's picks only once everyone has answered (or the timer ended, handled when the question closes).
      const everyoneIn = team.memberIds.every(id => answered[id])
      tx.update(sessionRef(request.quizId, request.teamId), { answered, ...(everyoneIn ? { picks } : {}), updatedAt: FieldValue.serverTimestamp() })
    })
    return { ok: true }
  })
}

export async function lockTeamAnswer(call: CallableRequest<unknown>) {
  const uid = authedUid(call)
  return guarded(async () => {
    const request = parseAnswerRequest(call.data)
    await enforceRate(uid, 'play', RATE.play)
    await db().runTransaction(async tx => {
      const ctx = await loadPlay(tx, request.quizId, request.teamId)
      const { quiz, team, session, priv } = ctx
      const now = Date.now()
      if (quiz.settings.answerMode !== 'everyone') throw new GroupQuizError('This quiz has no lock-in step.', 'failed-precondition')
      assertMember(team, uid)
      const question = session.question
      if (session.phase !== 'answering' || !question || request.questionIndex !== session.currentIndex || session.locked) throw new GroupQuizError('That question is no longer open.', 'failed-precondition')
      if (!canLockAnswer({ waitForEveryone: quiz.settings.waitForEveryone, memberCount: team.memberIds.length, pickCount: countOf(team, session.answered), endsAtMs: session.questionEndsAt, nowMs: now })) {
        throw new GroupQuizError('Wait until everyone has answered before locking in.', 'failed-precondition')
      }
      const final = validateAnswer({ type: question.type, prompt: question.prompt, options: question.options.map(option => option.id) }, request.answer)
      closeQuestion(tx, { ...ctx, priv }, { final, lockedBy: uid, auto: false }, now)
    })
    return { ok: true }
  })
}

// ---- moving on --------------------------------------------------------------------------------------------------

/**
 * One call, one legal transition. While answering it only does something once the server deadline passed (the question closes with
 * the team's auto answer). In review each caller marks themselves ready and the team moves on when the pacing rules allow it.
 */
export async function advanceTeam(call: CallableRequest<unknown>) {
  const uid = authedUid(call)
  return guarded(async () => {
    const request = parseQuestionStep(call.data)
    await enforceRate(uid, 'play', RATE.play)
    return db().runTransaction(async tx => {
      const ctx = await loadPlay(tx, request.quizId, request.teamId)
      const { quiz, team, session, priv } = ctx
      const isInstructor = uid === quiz.ownerId
      if (!isInstructor) {
        assertMember(team, uid)
      }
      const now = Date.now()
      const idle = { advanced: false, phase: session.phase, currentIndex: session.currentIndex }
      if (request.questionIndex < session.currentIndex || session.phase === 'finished') return idle
      if (request.questionIndex > session.currentIndex) throw new GroupQuizError('The question is invalid.')
      const question = session.question
      if (!question) return idle
      if (session.phase === 'answering') {
        if (!isInstructor && (session.locked || !isTimeUp(session.questionEndsAt, now))) return idle
        const picks = priv.picks[question.id] ?? {}
        const final = quiz.settings.answerMode === 'representative' ? (picks[team.representativeId] ?? null) : autoAnswer(picks, team.memberIds)
        closeQuestion(tx, ctx, { final, lockedBy: isInstructor ? uid : null, auto: !isInstructor }, now)
        return { advanced: true, phase: 'review' as const, currentIndex: session.currentIndex }
      }
      const ready: Record<string, true> = { ...session.ready, [uid]: true }
      const allowed = isInstructor || canAdvanceReview({
        waitForEveryone: quiz.settings.waitForEveryone, memberCount: team.memberIds.length, readyCount: countOf(team, ready),
        reviewElapsedMs: now - (session.reviewStartedAt ?? now), hasTimer: quiz.settings.questionTimeSec !== null,
      })
      if (!allowed) {
        tx.update(sessionRef(request.quizId, request.teamId), { ready, updatedAt: FieldValue.serverTimestamp() })
        return idle
      }
      const nextIndex = session.currentIndex + 1
      if (nextIndex >= session.total) {
        tx.set(sessionRef(request.quizId, request.teamId), finishedSessionFields(session.total))
        return { advanced: true, phase: 'finished' as const, currentIndex: nextIndex }
      }
      const nextId = priv.questionOrder[nextIndex]
      if (!nextId) {
        tx.set(sessionRef(request.quizId, request.teamId), finishedSessionFields(session.total))
        return { advanced: true, phase: 'finished' as const, currentIndex: nextIndex }
      }
      const nextDoc = await tx.get(questionDoc(request.quizId, nextId))
      if (!nextDoc.exists) {
        tx.set(sessionRef(request.quizId, request.teamId), finishedSessionFields(session.total))
        return { advanced: true, phase: 'finished' as const, currentIndex: nextIndex }
      }
      const next = toSessionQuestion(nextDoc, nextIndex, priv.optionOrder[nextId])
      tx.set(sessionRef(request.quizId, request.teamId), openSessionFields(next, session.total, quiz, now))
      return { advanced: true, phase: 'answering' as const, currentIndex: nextIndex }
    })
  })
}
