import { useMemo, useRef, useState } from 'react'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { Dialog } from '../../shared/ui/Dialog'
import { Input } from '../../shared/ui/Input'
import { Textarea } from '../../shared/ui/Textarea'
import { DocumentChips, DocumentPicker, useDocumentImport } from '../documents'
import { AiError } from '../studyEngine/ai'
import { generateLessonPlan, generateRemainingLessons, type GeneratedLessonPlan } from './generate'
import { describeLessonGeneration } from './generationMessage'
import { createLessonPlan, saveLesson } from './services'
import type { LessonLevel, LessonPlan } from './types'

interface Props { uid: string; onClose: () => void; onSaved: (plan: LessonPlan) => void; onOpen: (plan: LessonPlan) => void }
const levels: LessonLevel[] = ['beginner', 'intermediate', 'advanced']

export function LearnTopicDialog({ uid, onClose, onSaved, onOpen }: Props) {
  const documents = useDocumentImport(5)
  const [topic, setTopic] = useState('')
  const [level, setLevel] = useState<LessonLevel>('beginner')
  const [lessonCount, setLessonCount] = useState(5)
  const [pasted, setPasted] = useState('')
  const [result, setResult] = useState<GeneratedLessonPlan | null>(null)
  const [plan, setPlan] = useState<LessonPlan | null>(null)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const sourceText = useMemo(() => [pasted, ...documents.documents.map(file => `# ${file.name}\n${file.text}`)].filter(Boolean).join('\n\n'), [pasted, documents.documents])

  const persist = async (generated: GeneratedLessonPlan) => {
    if (!plan) {
      const created = await createLessonPlan(uid, { outline: generated.outline, topic: topic.trim(), level, lessons: generated.lessons, status: generated.status, sourceText })
      setPlan(created)
      setResult(generated)
      onSaved(created)
      return
    }
    for (const [lessonId, lesson] of Object.entries(generated.lessons)) {
      if (!result?.lessons[lessonId]) await saveLesson(uid, plan.id, lessonId, lesson)
    }
    setResult(generated)
    const refreshed = { ...plan, status: generated.status, updatedAt: plan.updatedAt }
    setPlan(refreshed)
    onSaved(refreshed)
  }

  const start = async (remaining = false) => {
    controller.current = new AbortController()
    setBusy(true); setError(''); setProgress('')
    try {
      const generated = remaining && result
        ? await generateRemainingLessons({ topic, level, lessonCount, sourceText, signal: controller.current.signal, outline: result.outline, existing: result.lessons, lessonIds: result.failedLessonIds, onProgress: (done, total) => setProgress(`Lesson ${done} of ${total}`) })
        : await generateLessonPlan({ topic, level, lessonCount, sourceText, signal: controller.current.signal, onProgress: (done, total) => setProgress(`Lesson ${done} of ${total}`) })
      await persist(generated)
      if (generated.failureReason === 'rate-limit') setError(describeLessonGeneration(generated))
      else if (generated.failureReason) setError('The AI could not validate a later lesson. Completed lessons are saved; retry the remaining lessons.')
      else if (generated.cancelled) setError('Generation was stopped. Completed lessons are saved as a partial plan.')
    } catch (cause) {
      console.error('Lesson generation failed', cause)
      setError(cause instanceof RangeError ? 'Something went wrong while building your plan. Try again, or use a shorter source.' : cause instanceof AiError && cause.reason === 'rate-limit' ? cause.message : cause instanceof Error ? cause.message : 'Could not create this lesson plan.')
    } finally { setBusy(false); controller.current = null }
  }

  const madeCount = result ? Object.keys(result.lessons).length : 0
  const missing = result?.failedLessonIds.length ?? 0
  return <Dialog open onClose={busy ? () => undefined : onClose} title="Learn a topic" description="Build a private, self-paced lesson plan.">
    <div className="grid gap-4">
      {!result && <>
        <Input label="Topic" value={topic} onChange={event => setTopic(event.target.value)} maxLength={500} hint="The topic guides the plan. Text you paste is treated as study material, not instructions."/>
        <label className="field"><span className="field__label">Level</span><select className="field__control" value={level} onChange={event => setLevel(event.target.value as LessonLevel)}>{levels.map(item => <option key={item} value={item}>{item[0]!.toUpperCase() + item.slice(1)}</option>)}</select></label>
        <label className="field"><span className="field__label">Number of lessons</span><select className="field__control" value={lessonCount} onChange={event => setLessonCount(Number(event.target.value))}>{Array.from({ length: 8 }, (_, index) => index + 3).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <Textarea label="Optional study material" hint="Paste notes or add PDF, DOCX, PPTX, text, Markdown, or CSV files." rows={6} value={pasted} onChange={event => setPasted(event.target.value)}/>
        <DocumentPicker onFiles={files => void documents.addFiles(files)} count={documents.documents.length} max={5} preparing={documents.preparing} disabled={busy}/>
        <DocumentChips documents={documents.documents} onRemove={documents.remove} disabled={busy} label="Study material files"/>
        {documents.preparing && <p role="status" className="m-0 text-sm text-navy-900">Reading your document…</p>}
        {documents.errors.length > 0 && <Alert tone="warning" label="Some files were not added">{documents.errors.join(' ')}</Alert>}
      </>}
      {busy && <p role="status" className="m-0 text-base text-navy-900">{progress || 'Starting lesson generation…'}</p>}
      {error && <Alert tone="error" label="Lesson generation">{error}</Alert>}
      {result && <section className="grid gap-3"><h3 className="m-0 text-lg font-bold text-navy-900">{result.outline.title}</h3><p className="m-0 text-base text-navy-900">{madeCount} of {result.outline.lessons.length} lessons ready · {result.status === 'ready' ? 'Plan complete' : 'Partial plan saved'}.</p>{result.sourceCapped && <Alert tone="warning" label="Material limit">Only the first 60,000 characters were sent to AI.</Alert>}<ol className="m-0 grid gap-2 pl-5">{result.outline.lessons.map(item => <li key={item.id} className="text-base text-navy-900">{item.title}{result.lessons[item.id] ? ' · Ready' : ' · Not generated'}</li>)}</ol>{missing > 0 && <Button variant="primary" disabled={busy} onClick={() => void start(true)}>Generate the rest ({missing})</Button>}{plan && <Button variant="secondary" onClick={() => { onClose(); onOpen(plan) }}>Open lesson plan</Button>}</section>}
      <footer className="flex flex-wrap justify-between gap-2 border-t border-navy-900-15 pt-3"><Button variant="secondary" onClick={() => { controller.current?.abort(); if (!busy) onClose() }}>{busy ? 'Cancel generation' : 'Close'}</Button>{!result && <Button variant="primary" disabled={busy || !topic.trim() || documents.preparing} onClick={() => void start()}>Create lesson plan</Button>}</footer>
    </div>
  </Dialog>
}
