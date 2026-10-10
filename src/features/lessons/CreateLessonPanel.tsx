import { useEffect, useState } from 'react'
import { Square } from 'lucide-react'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { Input } from '../../shared/ui/Input'
import { useLessonPlanBuilder } from './useLessonPlanBuilder'
import type { LessonLevel, LessonPlan } from './types'

const levels: LessonLevel[] = ['beginner', 'intermediate', 'advanced']
const lessonCounts = Array.from({ length: 8 }, (_, index) => index + 3)

interface CreateLessonPanelProps {
  uid: string
  /** Study material already collected by the Create flow. Sent to the AI as data, never as instructions. */
  sourceText: string
  initialTopic?: string
  onBusyChange?: (busy: boolean) => void
  onSaved?: (plan: LessonPlan) => void
  onOpen: (plan: LessonPlan) => void
}

/** The "Lesson plan" output of the Create flow: turns the chosen source into a private lesson plan. */
export function CreateLessonPanel({ uid, sourceText, initialTopic = '', onBusyChange, onSaved, onOpen }: CreateLessonPanelProps) {
  const [topic, setTopic] = useState(initialTopic)
  const [level, setLevel] = useState<LessonLevel>('beginner')
  const [lessonCount, setLessonCount] = useState(5)
  const { result, plan, progress, error, busy, start, cancel } = useLessonPlanBuilder(
    { uid, topic, level, lessonCount, sourceText },
    onSaved,
  )

  useEffect(() => { onBusyChange?.(busy) }, [busy, onBusyChange])

  const made = result ? Object.keys(result.lessons).length : 0
  const missing = result?.failedLessonIds.length ?? 0

  if (result) {
    return <section className="grid gap-3" aria-live="polite">
      <h4 className="m-0 text-lg font-bold text-navy-900">{result.outline.title}</h4>
      <p className="m-0 text-base text-navy-900">{made} of {result.outline.lessons.length} lessons ready · {result.status === 'ready' ? 'Plan complete' : 'Partial plan saved'}.</p>
      {result.sourceCapped && <Alert tone="warning" label="Material limit">Only the first 60,000 characters were sent to the AI.</Alert>}
      {error && <Alert tone="info" label="Lesson generation">{error}</Alert>}
      {busy && <p role="status" className="m-0 text-base text-navy-900">{progress || 'Generating…'}</p>}
      <ol className="m-0 grid gap-2 pl-5">{result.outline.lessons.map(item => <li key={item.id} className="text-base text-navy-900">{item.title}{result.lessons[item.id] ? ' · Ready' : ' · Not generated'}</li>)}</ol>
      <div className="flex flex-wrap gap-2">
        {missing > 0 && (busy
          ? <Button variant="secondary" onClick={cancel}><Square size={14} aria-hidden="true"/>Stop</Button>
          : <Button variant="primary" onClick={() => void start(true)}>Generate the rest ({missing})</Button>)}
        {plan && <Button variant={missing > 0 ? 'secondary' : 'primary'} disabled={busy} onClick={() => onOpen(plan)}>Open lesson plan</Button>}
      </div>
    </section>
  }

  return <section className="grid gap-4" aria-label="Lesson plan settings">
    <p className="m-0 text-base text-navy-900">The AI turns your material into an ordered plan. Each lesson has a reading, flashcards and a short quiz. Every lesson is a separate AI request, so larger plans can take a minute or two.</p>
    <Input label="Topic" value={topic} onChange={event => setTopic(event.target.value)} maxLength={500} disabled={busy} hint="Name what you are learning. Your material is used as study content, not instructions."/>
    <label className="field"><span className="field__label">Level</span><select className="field__control" value={level} disabled={busy} onChange={event => setLevel(event.target.value as LessonLevel)}>{levels.map(item => <option key={item} value={item}>{item[0]!.toUpperCase() + item.slice(1)}</option>)}</select></label>
    <label className="field"><span className="field__label">Number of lessons</span><select className="field__control" value={lessonCount} disabled={busy} onChange={event => setLessonCount(Number(event.target.value))}>{lessonCounts.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    {busy && <p role="status" className="m-0 text-base text-navy-900">{progress || 'Starting lesson generation…'}</p>}
    {error && <Alert tone="error" label="Lesson generation">{error}</Alert>}
    {busy
      ? <Button variant="secondary" onClick={cancel}><Square size={14} aria-hidden="true"/>Stop generation</Button>
      : <Button variant="primary" disabled={!uid || !topic.trim() || !sourceText.trim()} onClick={() => void start()}>Create lesson plan</Button>}
  </section>
}
