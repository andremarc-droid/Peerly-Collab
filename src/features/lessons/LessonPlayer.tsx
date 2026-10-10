import { useMemo } from 'react'
import { Timestamp } from 'firebase/firestore'
import { Button } from '../../shared/ui/Button'
import { SafeMarkdown } from '../learningCanvas/components/SafeMarkdown'
import { FlashcardPractice } from '../flashcards/components/FlashcardPractice'
import { QuizModeScreen } from '../flashcards/components/QuizModeScreen'
import type { FlashcardDeckWithId } from '../flashcards/types'
import type { Lesson, LessonCompletion, LessonPlan, LessonStep } from './types'

interface Props {
  uid: string
  plan: LessonPlan
  lesson: Lesson
  completion: LessonCompletion | undefined
  step: LessonStep
  onStep: (step: Exclude<LessonStep, 'done'>) => void
  onQuizComplete: (score: number, total: number) => void
  onNext: () => void
  hasNext: boolean
}
const stages: Array<Exclude<LessonStep, 'done'>> = ['read', 'practice', 'quiz']

export function LessonPlayer({ uid, plan, lesson, completion, step, onStep, onQuizComplete, onNext, hasNext }: Props) {
  const deck = useMemo<FlashcardDeckWithId>(() => ({
    id: `lesson~${plan.id}~${lesson.id}`, ownerId: uid, classId: uid, kind: 'personal', status: 'private', title: lesson.title,
    description: lesson.objective, cardCount: lesson.flashcards.length, cards: lesson.flashcards,
    createdAt: Timestamp.fromMillis(plan.createdAt.toMillis()), updatedAt: Timestamp.fromMillis(lesson.updatedAt.toMillis()),
  }), [lesson, plan, uid])
  const srsKey = `lesson~${plan.id}~${lesson.id}`
  const currentStage = step === 'done' ? 3 : stages.indexOf(step)

  return <section className="grid min-w-0 gap-4" aria-label={`Lesson: ${lesson.title}`}>
    <nav className="grid grid-cols-3 gap-2" aria-label="Lesson steps">{stages.map((item, index) => <Button key={item} variant={currentStage === index ? 'primary' : 'secondary'} disabled={index > currentStage} aria-current={currentStage === index ? 'step' : undefined} onClick={() => onStep(item)}>{item[0]!.toUpperCase() + item.slice(1)}</Button>)}</nav>
    {step === 'read' && <div className="grid gap-4"><p className="m-0 text-base text-navy-900"><strong>Objective:</strong> {lesson.objective}</p><article className="min-w-0 rounded-2xl border border-navy-900-15 bg-white p-4"><SafeMarkdown content={lesson.content}/></article><section className="grid gap-2"><h3 className="m-0 text-lg font-bold text-navy-900">Key points</h3><ul className="m-0 grid gap-2 pl-5">{lesson.keyPoints.map((point, index) => <li key={`${index}-${point}`} className="text-base text-navy-900">{point}</li>)}</ul></section><Button variant="primary" onClick={() => onStep('practice')}>Continue to practice</Button></div>}
    {step === 'practice' && <div className="grid gap-4"><FlashcardPractice deck={deck} progressKey={srsKey}/><Button variant="primary" onClick={() => onStep('quiz')}>Continue to quiz</Button></div>}
    {step === 'quiz' && <QuizModeScreen deck={deck} progressKey={srsKey} onComplete={onQuizComplete}/>}
    {step === 'done' && <section className="grid gap-3" aria-live="polite"><h3 className="m-0 text-xl font-bold text-navy-900">Lesson complete</h3><p className="m-0 text-base text-navy-900">Best quiz score: {completion?.bestScore ?? 0} of {lesson.quiz.length}.</p>{hasNext ? <Button variant="primary" onClick={onNext}>Next lesson</Button> : <p className="m-0 text-base text-navy-900">You finished every lesson in this plan.</p>}</section>}
    {!completion && <span className="sr-only">Lesson progress has not been saved yet.</span>}
  </section>
}
