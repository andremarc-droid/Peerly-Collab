import { Archive, BarChart3, Copy, Ellipsis, Pencil, RotateCcw, Send, Trash2 } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '../../shared/ui/Alert'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { DataCard } from '../../shared/ui/DataCard'
import { Dialog } from '../../shared/ui/Dialog'
import { DropdownMenu } from '../../shared/ui/DropdownMenu'
import { EmptyState } from '../../shared/ui/EmptyState'
import { resolveListStatus } from '../../shared/ui/listState'
import { Select } from '../../shared/ui/Select'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import {
  archiveQuiz,
  countQuizAttempts,
  deleteQuizCascade,
  duplicateQuiz,
  restoreQuiz,
  unpublishQuiz,
  type QuizRecord,
} from '../quizzes/services'
import { QuizTypeBadge } from '../quizzes/QuizTypeBadge'
import type { ClassWithId } from './types'
import { copyQuizToClass } from './services/quizService'
import { canvasBoardStatus } from './classActivities'

export interface ClassActivityListProps {
  classroom: ClassWithId
  classes: ClassWithId[]
  activities: QuizRecord[]
  loading: boolean
  error: string | null
  onRetry: () => void
  emptyTitle: string
  emptyDescription: string
  emptyAction?: ReactNode
  errorLabel?: string
}

export function ClassActivityList({
  classroom,
  classes,
  activities,
  loading,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
  emptyAction,
  errorLabel = 'Activities unavailable',
}: ClassActivityListProps) {
  const { showToast } = useToast()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [copySelection, setCopySelection] = useState<QuizRecord | null>(null)
  const [targetClass, setTargetClass] = useState('')
  const [deleteSelection, setDeleteSelection] = useState<{ quiz: QuizRecord; submissions: number } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const targets = useMemo(
    () => classes.filter((item) => item.status === 'active' && item.id !== classroom.id),
    [classes, classroom.id],
  )

  async function action(id: string, success: string, run: () => Promise<unknown>) {
    setBusyId(id)
    try {
      await run()
      showToast('success', success)
    } catch (reason) {
      showToast('error', reason instanceof Error ? reason.message : 'The action could not be completed.')
    } finally {
      setBusyId(null)
    }
  }

  async function startDelete(quiz: QuizRecord) {
    setDeleteBusy(true)
    try {
      setDeleteSelection({ quiz, submissions: await countQuizAttempts(quiz.id) })
    } catch (reason) {
      showToast('error', reason instanceof Error ? reason.message : 'Could not check submissions.')
    } finally {
      setDeleteBusy(false)
    }
  }

  async function remove() {
    if (!deleteSelection) return
    await action(deleteSelection.quiz.id, `“${deleteSelection.quiz.title}” and its submissions were deleted.`, () => deleteQuizCascade(deleteSelection.quiz.id))
    setDeleteSelection(null)
  }

  async function copyToClass() {
    if (!copySelection || !targetClass) return
    await action(copySelection.id, 'Draft copy created in the selected class.', () =>
      copyQuizToClass(copySelection.id, targetClass),
    )
    setCopySelection(null)
  }

  const listStatus = resolveListStatus({ loading, error, count: activities.length })

  if (listStatus === 'error') {
    return (
      <Alert
        tone="error"
        label={errorLabel}
        action={
          <Button type="button" variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        }
      >
        {error}
      </Alert>
    )
  }

  if (listStatus === 'loading') {
    return (
      <div className="grid gap-3">
        {[0, 1, 2].map((item) => (
          <Skeleton key={item} className="h-36 rounded-3xl" label="Loading activity" />
        ))}
      </div>
    )
  }

  if (listStatus === 'empty') {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
  }

  return (
    <>
      <div className="grid gap-3">
        {activities.map((quiz) => {
          const isCanvas = quiz.mode === 'canvas'
          const metaStatus = isCanvas
            ? 'Canvas board'
            : `${quiz.questionCount} ${quiz.questionCount === 1 ? 'question' : 'questions'}`
          const updatedDate = quiz.updatedAt.toDate().toLocaleDateString(undefined, { dateStyle: 'medium' })
          const meta = `${metaStatus} · Updated ${updatedDate}`
          const busy = busyId === quiz.id
          const editPath = `/instructor/quizzes/${quiz.id}`
          const resultsPath = `/instructor/quizzes/${quiz.id}/results`
          const isDraft = quiz.status === 'draft'
          const isPublished = quiz.status === 'published'
          const isArchived = quiz.status === 'archived'

          return (
            <DataCard
              key={quiz.id}
              title={quiz.title || 'Untitled quiz'}
              meta={meta}
              badge={
                <div className="flex flex-wrap gap-2">
                  <Badge>{quiz.status[0].toUpperCase() + quiz.status.slice(1)}</Badge>
                  <QuizTypeBadge mode={quiz.mode} />
                  {isCanvas && (
                    <Badge>{quiz.boardKind === 'blank' ? 'You grade' : 'Auto-graded'}</Badge>
                  )}
                </div>
              }
            >
              {isCanvas ? (
                <p className="m-0 flex flex-wrap gap-2 text-sm text-navy-800-72">
                  <span>{canvasBoardStatus(quiz)}</span>
                  <span>
                    {quiz.settings.participation.type === 'group'
                      ? `Group of ${quiz.settings.participation.groupSize}`
                      : 'Individual'}
                  </span>
                  <span>{quiz.settings.timeLimitMinutes ? `${quiz.settings.timeLimitMinutes} minutes` : 'Untimed'}</span>
                </p>
              ) : (
                <p className="m-0 flex flex-wrap gap-2 text-sm text-navy-800-72">
                  <span>
                    {quiz.settings.participation.type === 'group'
                      ? `Group of ${quiz.settings.participation.groupSize}`
                      : 'Individual'}
                  </span>
                  <span>
                    {quiz.settings.answerReveal === 'never'
                      ? 'Answers hidden'
                      : quiz.settings.answerReveal === 'after_each'
                      ? 'Answers after each question'
                      : 'Answers after submission'}
                  </span>
                  <span>{quiz.settings.timeLimitMinutes ? `${quiz.settings.timeLimitMinutes} minutes` : 'Untimed'}</span>
                </p>
              )}

              {/* One primary action per card, the same on every screen size. Everything else lives in the menu. */}
              <div className="flex w-full items-center justify-between gap-2">
                {isDraft && <Button to={editPath}>Continue editing</Button>}
                {isPublished && <Button to={resultsPath}><BarChart3 size={15} aria-hidden="true" /> View results</Button>}
                {isArchived && (
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => void action(quiz.id, isCanvas ? 'Canvas restored to drafts.' : 'Quiz restored to drafts.', () => restoreQuiz(quiz.id))}
                  >
                    <RotateCcw size={15} aria-hidden="true" /> Restore
                  </Button>
                )}
                <DropdownMenu label={`More actions for ${quiz.title || 'Untitled quiz'}`} iconOnly trigger={<Ellipsis size={20} aria-hidden="true" />}>
                  {isPublished && (
                    <Link role="menuitem" to={editPath}>
                      <Pencil size={16} aria-hidden="true" /> Edit
                    </Link>
                  )}
                  {isDraft && (
                    <Link role="menuitem" to={resultsPath}>
                      <BarChart3 size={16} aria-hidden="true" /> Results
                    </Link>
                  )}
                  {isArchived && (
                    <Link role="menuitem" to={resultsPath}>
                      <BarChart3 size={16} aria-hidden="true" /> Results
                    </Link>
                  )}
                  {isDraft && classroom.status === 'active' && (
                    // Publishing always goes through the review step so the instructor sees what students will get.
                    <Link role="menuitem" to={`${editPath}?tab=publish`}>
                      <Send size={16} aria-hidden="true" /> Preview and publish
                    </Link>
                  )}
                  {isPublished && (
                    <button type="button" role="menuitem" disabled={busy} onClick={() => void action(quiz.id, isCanvas ? 'Canvas returned to draft.' : 'Quiz returned to draft.', () => unpublishQuiz(quiz.id))}>
                      <Send size={16} aria-hidden="true" /> Unpublish
                    </button>
                  )}
                  <button type="button" role="menuitem" disabled={busy || deleteBusy} onClick={() => void action(quiz.id, 'Draft copy created.', () => duplicateQuiz(quiz.id))}>
                    <Copy size={16} aria-hidden="true" /> Duplicate
                  </button>
                  {targets.length ? (
                    <button type="button" role="menuitem" disabled={busy || deleteBusy} onClick={() => { setCopySelection(quiz); setTargetClass(targets[0].id) }}>
                      <Copy size={16} aria-hidden="true" /> Copy to another class
                    </button>
                  ) : (
                    <Link role="menuitem" to="/instructor">
                      <Copy size={16} aria-hidden="true" /> Create a class to copy to
                    </Link>
                  )}
                  {!isArchived && (
                    <button type="button" role="menuitem" disabled={busy} onClick={() => void action(quiz.id, isCanvas ? 'Canvas archived.' : 'Quiz archived.', () => archiveQuiz(quiz.id))}>
                      <Archive size={16} aria-hidden="true" /> Archive
                    </button>
                  )}
                  <button type="button" role="menuitem" className="is-danger" disabled={deleteBusy || busy} onClick={() => void startDelete(quiz)}>
                    <Trash2 size={16} aria-hidden="true" /> Delete
                  </button>
                </DropdownMenu>
              </div>
            </DataCard>
          )
        })}
      </div>

      <Dialog
        open={Boolean(copySelection)}
        onClose={() => setCopySelection(null)}
        title={copySelection?.mode === 'canvas' ? 'Copy canvas to another class' : 'Copy quiz to another class'}
        description={copySelection ? `Create a separate draft of “${copySelection.title}”.` : undefined}
      >
        {targets.length ? (
          <>
            <Select
              label="Destination class"
              name="copy-target-class"
              value={targetClass}
              onChange={(event) => setTargetClass(event.target.value)}
              options={targets.map((item) => ({ value: item.id, label: item.name }))}
            />
            <div className="dialog__actions">
              <Button type="button" variant="secondary" onClick={() => setCopySelection(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void copyToClass()}
                disabled={!targetClass || busyId === copySelection?.id}
              >
                {copySelection?.mode === 'canvas' ? 'Copy canvas' : 'Copy quiz'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p>You need another active class before you can copy this {copySelection?.mode === 'canvas' ? 'canvas' : 'quiz'}.</p>
            <Link to="/instructor" className="text-navy-800 underline">
              Create a class
            </Link>
          </>
        )}
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteSelection)}
        onClose={() => setDeleteSelection(null)}
        onConfirm={() => void remove()}
        title={deleteSelection?.quiz.mode === 'canvas' ? 'Delete this canvas?' : 'Delete this quiz?'}
        description={
          deleteSelection
            ? `This erases ${deleteSelection.submissions} student ${
                deleteSelection.submissions === 1 ? 'submission' : 'submissions'
              } and all ${deleteSelection.quiz.mode === 'canvas' ? 'canvas' : 'quiz'} content. Archive ${
                deleteSelection.quiz.mode === 'canvas' ? 'the canvas' : 'the quiz'
              } if you may want it later.`
            : ''
        }
        requiredName={deleteSelection?.quiz.title}
        confirmLabel={deleteSelection?.quiz.mode === 'canvas' ? 'Delete canvas' : 'Delete quiz'}
      />
    </>
  )
}
