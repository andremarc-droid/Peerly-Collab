import { useEffect, useState } from 'react'
import { Input } from '../../../shared/ui/Input'
import { useToast } from '../../../shared/ui/useToast'
import { updateQuiz } from '../services/quizService'

type TitleStatus = 'idle' | 'saving' | 'saved'

interface QuizTitleFieldProps {
  quizId: string
  title: string
  /** Called with the trimmed title after it was saved, so the page can update its own copy. */
  onSaved?: (title: string) => void
}

/**
 * The quiz title, editable right where you build. It saves when you click away or press Enter,
 * so renaming never needs a trip to Settings.
 */
export function QuizTitleField({ quizId, title, onSaved }: QuizTitleFieldProps) {
  const { showToast } = useToast()
  const [value, setValue] = useState(title)
  const [status, setStatus] = useState<TitleStatus>('idle')
  const [error, setError] = useState<string | undefined>()

  useEffect(() => { setValue(title) }, [title])

  async function commit() {
    const next = value.trim()
    if (!next) {
      setValue(title)
      setError('A title is required.')
      return
    }
    setError(undefined)
    if (next === title.trim()) {
      setValue(next)
      return
    }
    setStatus('saving')
    try {
      await updateQuiz(quizId, { title: next })
      setValue(next)
      setStatus('saved')
      onSaved?.(next)
    } catch (reason) {
      setValue(title)
      setStatus('idle')
      showToast('error', reason instanceof Error ? reason.message : 'The title could not be saved.')
    }
  }

  return (
    <div className="mb-3 max-w-xl">
      <Input
        label="Quiz title"
        name="quiz-title-inline"
        value={value}
        maxLength={120}
        error={error}
        onChange={(event) => { setValue(event.target.value); setError(undefined); setStatus('idle') }}
        onBlur={() => void commit()}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
      />
      <span className="field__hint" role="status">{status === 'saving' ? 'Saving…' : status === 'saved' ? 'Title saved' : ''}</span>
    </div>
  )
}
