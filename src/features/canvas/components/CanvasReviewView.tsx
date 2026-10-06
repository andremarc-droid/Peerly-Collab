import { lazy, Suspense, useCallback, useMemo } from 'react'
import { Check, HelpCircle, X } from 'lucide-react'
import { Skeleton } from '../../../shared/ui/Skeleton'
import { buildCanvasDiff, parseConnectionEdge, scatterCards } from '../schemas'
import type { CanvasAnswerKey, CanvasCard, CanvasQuestion } from '../types'
import type { ConnectionStatus } from '../mapping'

const CanvasBoard = lazy(() => import('./CanvasBoard'))

export interface CanvasReviewViewProps {
  question: CanvasQuestion
  attemptId: string
  studentAnswer: string | string[] | undefined
  answerKey: CanvasAnswerKey
  className?: string
}

export function CanvasReviewView({
  question,
  attemptId,
  studentAnswer,
  answerKey,
  className = '',
}: CanvasReviewViewProps) {
  const studentEdges: string[] = useMemo(() => {
    if (Array.isArray(studentAnswer)) return studentAnswer
    if (typeof studentAnswer === 'string' && studentAnswer.trim()) return [studentAnswer.trim()]
    return []
  }, [studentAnswer])

  const diff = useMemo(() => {
    return buildCanvasDiff(
      studentEdges,
      answerKey.connections ?? [],
      question.directed ?? true,
      question.cards ?? [],
    )
  }, [studentEdges, answerKey.connections, question.directed, question.cards])

  // Map review status for each rendered edge
  const { allConnections, statusByConnection } = useMemo(() => {
    const statusMap: Record<string, ConnectionStatus> = {}
    diff.correct.forEach((edge) => {
      statusMap[edge] = 'correct'
    })
    diff.wrong.forEach((edge) => {
      statusMap[edge] = 'wrong'
    })
    diff.missed.forEach((edge) => {
      statusMap[edge] = 'missed'
    })

    const combined = [...diff.correct, ...diff.wrong, ...diff.missed]
    return { allConnections: combined, statusByConnection: statusMap }
  }, [diff])

  // Stable layout seeded with attemptId for scattered mode
  const displayCards: CanvasCard[] = useMemo(() => {
    if (question.layoutMode === 'fixed') {
      return question.cards ?? []
    }
    return scatterCards(question.cards ?? [], attemptId, { width: 1200, height: 900 })
  }, [question.layoutMode, question.cards, attemptId])

  const cardLabel = useCallback(
    (cardId: string) => {
      const card = displayCards.find((c) => c.id === cardId)
      if (!card) return cardId
      return card.title?.trim() || card.content.slice(0, 35) || card.id
    },
    [displayCards],
  )

  const separator = question.directed ? '→' : '—'

  return (
    <div className={`canvas-review-view grid gap-4 ${className}`} data-testid="canvas-review-view">
      {/* Review mode CanvasBoard */}
      <div className="relative h-[500px] w-full overflow-hidden rounded-2xl border border-navy-900-12 bg-surface-primary">
        <Suspense fallback={<Skeleton className="h-full w-full rounded-2xl" label="Loading review board" />}>
          <CanvasBoard
            cards={displayCards}
            connections={allConnections}
            mode="review"
            directed={question.directed}
            statusByConnection={statusByConnection}
          />
        </Suspense>
      </div>

      {/* Accessible Plain List Companion (Text labels and Icons, not color alone) */}
      <section
        className="canvas-review-list grid gap-3 rounded-2xl border border-navy-900-12 bg-white p-4 sm:p-5"
        aria-labelledby="canvas-review-connections-heading"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-900-8 pb-3">
          <h3 id="canvas-review-connections-heading" className="m-0 text-base font-semibold text-navy-900">
            Connection breakdown
          </h3>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="inline-flex items-center gap-1 rounded-full bg-feedback-success/15 px-2.5 py-1 text-feedback-success">
              <Check size={13} aria-hidden="true" />
              <span>{diff.correct.length} correct</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-feedback-error/15 px-2.5 py-1 text-feedback-error">
              <X size={13} aria-hidden="true" />
              <span>{diff.wrong.length} incorrect</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-navy-900-12 px-2.5 py-1 text-navy-900">
              <HelpCircle size={13} aria-hidden="true" />
              <span>{diff.missed.length} missed</span>
            </span>
          </div>
        </div>

        {allConnections.length === 0 ? (
          <p className="m-0 text-sm text-navy-800-72 italic">
            No connections were submitted or expected.
          </p>
        ) : (
          <ul className="grid gap-2 p-0 list-none m-0" aria-label="Review connections breakdown">
            {/* 1. Correct connections */}
            {diff.correct.map((edge) => {
              const parsed = parseConnectionEdge(edge)
              const fromName = parsed ? cardLabel(parsed.from) : 'Card'
              const toName = parsed ? cardLabel(parsed.to) : 'Card'
              return (
                <li
                  key={`correct-${edge}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-feedback-success/30 bg-feedback-success/5 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-navy-900">
                    <span>{fromName}</span>
                    <span className="mx-2 text-navy-800-72 font-normal" aria-hidden="true">
                      {separator}
                    </span>
                    <span>{toName}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold text-feedback-success">
                    <Check size={14} aria-hidden="true" />
                    <span>Correct</span>
                  </span>
                </li>
              )
            })}

            {/* 2. Incorrect connections */}
            {diff.wrong.map((edge) => {
              const parsed = parseConnectionEdge(edge)
              const fromName = parsed ? cardLabel(parsed.from) : 'Card'
              const toName = parsed ? cardLabel(parsed.to) : 'Card'
              return (
                <li
                  key={`wrong-${edge}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-feedback-error/30 bg-feedback-error/5 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-navy-900">
                    <span>{fromName}</span>
                    <span className="mx-2 text-navy-800-72 font-normal" aria-hidden="true">
                      {separator}
                    </span>
                    <span>{toName}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold text-feedback-error">
                    <X size={14} aria-hidden="true" />
                    <span>Incorrect</span>
                  </span>
                </li>
              )
            })}

            {/* 3. Missed connections */}
            {diff.missed.map((edge) => {
              const parsed = parseConnectionEdge(edge)
              const fromName = parsed ? cardLabel(parsed.from) : 'Card'
              const toName = parsed ? cardLabel(parsed.to) : 'Card'
              return (
                <li
                  key={`missed-${edge}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-navy-900-16 bg-surface-secondary px-3 py-2 text-sm"
                >
                  <span className="font-medium text-navy-900">
                    <span>{fromName}</span>
                    <span className="mx-2 text-navy-800-72 font-normal" aria-hidden="true">
                      {separator}
                    </span>
                    <span>{toName}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold text-navy-800-72">
                    <HelpCircle size={14} aria-hidden="true" />
                    <span>Missed</span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        {answerKey.explanation && (
          <div className="mt-2 rounded-xl border border-navy-900-8 bg-surface-primary p-3 text-sm text-navy-900">
            <strong>Explanation:</strong> {answerKey.explanation}
          </div>
        )}
      </section>
    </div>
  )
}
export default CanvasReviewView
