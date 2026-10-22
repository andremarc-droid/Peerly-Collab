import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { Skeleton } from '../../../shared/ui/Skeleton'
import type { QuizRecord } from '../../quizzes/services/quizService'
import { listQuestions } from '../../quizzes/services/questionService'
import { describeTeamError, saveTeamBoard, submitTeamAttempt, watchTeamBoard, type TeamBoardData } from '../../quizzes/services/teamService'
import type { Team } from '../../quizzes/types/team'
import type { BlankCanvasAnswer } from '../../quizzes/types'
import type { CanvasQuestion } from '../../canvas/types'
import { BlankCanvasPlayPage } from '../BlankCanvasPlayPage'
import { CanvasPlayPage } from '../CanvasPlayPage'

export interface TeamCanvasPlayProps {
  quiz: QuizRecord
  team: Team
  uid: string
}

export function TeamCanvasPlay({ quiz, team, uid }: TeamCanvasPlayProps) {
  const isRepresentative = team.representativeId === uid
  const repName = team.memberNames[team.representativeId] || 'Your representative'
  const isBlank = quiz.boardKind === 'blank'

  const [question, setQuestion] = useState<(CanvasQuestion & { id: string }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [remoteBoard, setRemoteBoard] = useState<TeamBoardData | null>(null)
  const [localConnections, setLocalConnections] = useState<string[]>([])
  const [localBlankAnswer, setLocalBlankAnswer] = useState<BlankCanvasAnswer>({ cards: [], connections: [] })
  const initializedRef = useRef(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitConfirm, setSubmitConfirm] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [autosaveError, setAutosaveError] = useState('')

  // 1. Load the canvas question document
  useEffect(() => {
    let active = true
    void listQuestions(quiz.id)
      .then((items: Array<{ id: string; [key: string]: unknown }>) => {
        if (!active) return
        const found = items.find((q) => q.id === 'board' || q.type === 'canvas')
        if (found) {
          setQuestion(found as unknown as CanvasQuestion & { id: string })
        } else {
          setLoadError('The canvas board question could not be found.')
        }
      })
      .catch((err: unknown) => {
        if (active) setLoadError(err instanceof Error ? err.message : 'Could not load board question.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [quiz.id])

  // 2. Watch the shared team board in Firestore
  useEffect(() => {
    return watchTeamBoard(
      quiz.id,
      team.id,
      (board) => {
        setRemoteBoard(board)
        if (!initializedRef.current && board) {
          initializedRef.current = true
          if (Array.isArray(board.connections)) {
            setLocalConnections(board.connections)
          }
          if (Array.isArray(board.cards)) {
            setLocalBlankAnswer({
              cards: board.cards as BlankCanvasAnswer['cards'],
              connections: board.connections || [],
            })
          }
        }
      },
      (err) => setAutosaveError(err.message || 'Could not sync team board.'),
    )
  }, [quiz.id, team.id])

  // 3. Representative autosave with debounce
  const draftRef = useRef<{ cards?: unknown[]; connections: string[] }>({ connections: [] })
  draftRef.current = isBlank
    ? { cards: localBlankAnswer.cards, connections: localBlankAnswer.connections }
    : { connections: localConnections }

  const saveTimer = useRef<number | null>(null)
  const triggerAutosave = useCallback(() => {
    if (!isRepresentative) return
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current)
    }
    saveTimer.current = window.setTimeout(() => {
      void saveTeamBoard(quiz.id, team.id, draftRef.current, uid).catch((err: unknown) => {
        setAutosaveError(describeTeamError(err))
      })
    }, 800)
  }, [isRepresentative, quiz.id, team.id, uid])

  const handleBlankChange = useCallback(
    (nextVal: BlankCanvasAnswer) => {
      if (!isRepresentative) return
      setLocalBlankAnswer(nextVal)
      triggerAutosave()
    },
    [isRepresentative, triggerAutosave],
  )

  const handleConnectionsChange = useCallback(
    (nextConns: string[]) => {
      if (!isRepresentative) return
      setLocalConnections(nextConns)
      triggerAutosave()
    },
    [isRepresentative, triggerAutosave],
  )

  // 4. Submit team attempt
  const handleSubmit = async () => {
    setSubmitting(true)
    setSubmitError('')
    try {
      if (isRepresentative) {
        if (saveTimer.current !== null) {
          window.clearTimeout(saveTimer.current)
        }
        await saveTeamBoard(quiz.id, team.id, draftRef.current, uid)
      }
      await submitTeamAttempt(quiz.id, team.id)
    } catch (err) {
      setSubmitError(describeTeamError(err))
      setSubmitting(false)
    }
  }

  if (loading) {
    return <Skeleton className="h-72 rounded-3xl" label="Loading canvas board" />
  }

  if (loadError || !question) {
    return (
      <Alert tone="error" label="Canvas unavailable">
        {loadError || 'The canvas board question could not be loaded.'}
      </Alert>
    )
  }

  // Teammates see the remote board; representative sees local draft
  const activeBlankValue: BlankCanvasAnswer = isRepresentative
    ? localBlankAnswer
    : {
        cards: (remoteBoard?.cards as BlankCanvasAnswer['cards']) || [],
        connections: remoteBoard?.connections || [],
      }

  const activeConnections: string[] = isRepresentative
    ? localConnections
    : remoteBoard?.connections || []

  return (
    <div className="grid gap-4">
      {autosaveError && (
        <Alert tone="warning" label="Autosave issue">
          {autosaveError}
        </Alert>
      )}

      {submitError && (
        <Alert tone="error" label="Submission failed">
          {submitError}
        </Alert>
      )}

      {!isRepresentative ? (
        <Alert tone="info" label="Team representative editing">
          {repName} is editing the concept board for your team. You can watch updates live. Only your representative can submit the board.
        </Alert>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white rounded-2xl border border-navy-900-12 shadow-sm">
          <div>
            <span className="text-sm font-semibold text-navy-900">You are editing for {team.name}</span>
            <p className="m-0 text-xs text-navy-800-72">Your changes autosave live to all teammates.</p>
          </div>
          <Button
            type="button"
            variant="primary"
            disabled={submitting}
            onClick={() => setSubmitConfirm(true)}
          >
            {submitting ? 'Submitting…' : 'Submit for team'}
          </Button>
        </div>
      )}

      {isBlank ? (
        <BlankCanvasPlayPage
          question={question}
          attemptId={team.id}
          quizId={quiz.id}
          value={activeBlankValue}
          onChange={handleBlankChange}
          disabled={!isRepresentative || submitting}
        />
      ) : (
        <CanvasPlayPage
          question={question}
          attemptId={team.id}
          quizId={quiz.id}
          connections={activeConnections}
          onChange={handleConnectionsChange}
          disabled={!isRepresentative || submitting}
        />
      )}

      {isRepresentative && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="primary"
            disabled={submitting}
            onClick={() => setSubmitConfirm(true)}
          >
            {submitting ? 'Submitting…' : 'Submit for team'}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={submitConfirm}
        onClose={() => setSubmitConfirm(false)}
        onConfirm={() => {
          setSubmitConfirm(false)
          void handleSubmit()
        }}
        title="Submit concept board?"
        description="Once submitted, your team's concept board is complete and will be graded. All team members will share this result."
        confirmLabel="Submit for team"
        busy={submitting}
      />
    </div>
  )
}
