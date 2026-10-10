import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../../shared/ui/Button'
import { useAuth } from '../../auth/useAuth'
import { buildQueue, deckProgressKey, type StudyCard } from '../../studyEngine/queue'
import { loadProgress, saveProgress } from '../../studyEngine/services'
import { localDayKey, pruneProgress, recordGrade, type DeckProgress } from '../../studyEngine/progress'
import { previewIntervals, type ReviewGrade } from '../../studyEngine/srs'
import { FlipCard } from './FlipCard'
import type { FlashcardDeckWithId } from '../types'

interface Props { deck: FlashcardDeckWithId }
const grades: ReviewGrade[] = ['again', 'hard', 'good', 'easy']

export function FlashcardPractice({ deck }: Props) {
  const { user } = useAuth()
  const [progress, setProgress] = useState<DeckProgress>({ version: 1, cards: {}, newDay: localDayKey(new Date()), newCount: 0 })
  const [studiedCount, setStudiedCount] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const pointerStart = useRef<number | null>(null)
  const key = deckProgressKey(deck.classId, deck.id)
  const cards: StudyCard[] = useMemo(() => deck.cards.map(({ id, front, back }) => ({ id, front, back })), [deck.cards])
  const queue = buildQueue({ classId: deck.classId, id: deck.id, cards }, progress, now)
  const current = queue.cards[0]

  useEffect(() => {
    const uid = user?.uid
    if (!uid) { setLoading(false); return }
    let active = true
    void loadProgress(uid, key)
      .then(async value => {
        if (!active) return
        const pruned = pruneProgress(value, cards.map(card => card.id))
        if (Object.keys(pruned.cards).length !== Object.keys(value.cards).length) await saveProgress(uid, key, pruned)
        if (active) setProgress(pruned)
      })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load study progress.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [cards, key, user?.uid])

  const gradeCard = useCallback(async (grade: ReviewGrade) => {
    if (!user || !current || !flipped) return
    try {
      const reviewedAt = Date.now()
      const next = recordGrade(progress, current.id, grade, reviewedAt, localDayKey(new Date(reviewedAt)))
      setProgress(next)
      await saveProgress(user.uid, key, next)
      setStudiedCount(count => count + 1)
      setFlipped(false)
      setNow(reviewedAt)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save study progress.')
    }
  }, [current, flipped, key, progress, user])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.code === 'Space') { event.preventDefault(); setFlipped(value => !value) }
      const index = Number(event.key) - 1
      if (flipped && index >= 0 && index < grades.length) void gradeCard(grades[index]!)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [flipped, gradeCard])

  const handlePointerUp = (event: React.PointerEvent) => {
    if (!flipped || pointerStart.current === null) return
    const distance = event.clientX - pointerStart.current
    pointerStart.current = null
    if (Math.abs(distance) < 60) return
    void gradeCard(distance > 0 ? 'good' : 'again')
  }

  if (loading) return <p className="m-0 text-base text-navy-900" role="status">Loading your study progress…</p>
  if (error) return <p className="m-0 text-base text-navy-900" role="alert">{error}</p>
  if (!current) return <section className="grid gap-3" aria-live="polite">
    <h3 className="m-0 text-lg font-bold text-navy-900">Session complete</h3>
    <p className="m-0 text-base text-navy-900">You studied {studiedCount} cards. {queue.dueCount} due and {queue.newCount} new cards were in this session.</p>
  </section>

  const hints = previewIntervals(current.state, now)
  const progressPercent = Math.round((studiedCount / Math.max(studiedCount + queue.cards.length, 1)) * 100)
  return <section className="grid gap-4" aria-label="Flashcard study">
    <div className="grid gap-2">
      <p className="m-0 text-sm text-navy-900" aria-live="polite">Card {studiedCount + 1} of {studiedCount + queue.cards.length} · {queue.dueCount} due · {queue.newCount} new</p>
      <progress className="h-3 w-full accent-navy-900" max={Math.max(studiedCount + queue.cards.length, 1)} value={studiedCount} aria-label="Study session progress">{progressPercent}%</progress>
    </div>
    <div onPointerDown={event => { pointerStart.current = event.clientX }} onPointerUp={handlePointerUp} onPointerCancel={() => { pointerStart.current = null }}>
      <FlipCard key={current.id} front={current.front} back={current.back} flipped={flipped} onFlip={() => setFlipped(value => !value)}/>
    </div>
    {!flipped ? <Button variant="primary" onClick={() => setFlipped(true)}>Reveal answer <span className="sr-only">(Space)</span></Button> : <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {grades.map((grade, index) => <Button key={grade} type="button" variant={grade === 'good' ? 'primary' : 'secondary'} onClick={() => void gradeCard(grade)}>
        <span>{grade[0]!.toUpperCase() + grade.slice(1)}</span><span className="block text-sm">{hints[grade].split(' · ')[1]}</span><span className="sr-only">Keyboard {index + 1}</span>
      </Button>)}
      <p className="col-span-2 m-0 text-sm text-navy-900 sm:col-span-4">Swipe right for Good or left for Again.</p>
    </div>}
  </section>
}
