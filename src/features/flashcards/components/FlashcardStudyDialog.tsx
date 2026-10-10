import { lazy, Suspense, useState } from 'react'
import { Button } from '../../../shared/ui/Button'
import { Dialog } from '../../../shared/ui/Dialog'
import type { FlashcardDeckWithId } from '../types'
import { FlashcardPractice } from './FlashcardPractice'

const QuizModeScreen = lazy(() => import('./QuizModeScreen').then(module => ({ default: module.QuizModeScreen })))
const PracticeTestScreen = lazy(() => import('./PracticeTestScreen').then(module => ({ default: module.PracticeTestScreen })))

type StudyMode = 'flashcards' | 'quiz' | 'test'
interface Props { deck: FlashcardDeckWithId; onClose: () => void; initialMode?: StudyMode }

export function FlashcardStudyDialog({ deck, onClose, initialMode = 'flashcards' }: Props) {
  const [mode, setMode] = useState<StudyMode>(initialMode)
  return (
    <Dialog open onClose={onClose} title={deck.title} description="Choose how you want to study">
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Study mode">
          <Button variant={mode === 'flashcards' ? 'primary' : 'secondary'} onClick={() => setMode('flashcards')}>Flashcards</Button>
          <Button variant={mode === 'quiz' ? 'primary' : 'secondary'} onClick={() => setMode('quiz')}>Quiz</Button>
          <Button variant={mode === 'test' ? 'primary' : 'secondary'} onClick={() => setMode('test')}>Practice test</Button>
          <Button variant="secondary" disabled aria-label="Live game, coming soon">Live game · Coming soon</Button>
        </div>
        {mode === 'flashcards' && <FlashcardPractice deck={deck}/>}
        {mode === 'quiz' && <Suspense fallback={<p role="status">Loading quiz…</p>}><QuizModeScreen deck={deck}/></Suspense>}
        {mode === 'test' && <Suspense fallback={<p role="status">Loading practice test…</p>}><PracticeTestScreen deck={deck}/></Suspense>}
      </div>
    </Dialog>
  )
}
