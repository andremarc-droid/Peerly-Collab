import { Plus, Trash2 } from 'lucide-react'
import { Input } from '../../../shared/ui/Input'
import type { QuizMode, QuestionType } from '../types'
import { detectBlankCount, type QuestionDraft, type QuestionErrors } from './questionDraft'

const questionTypes: { value: QuestionType; label: string }[] = [
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'true_false', label: 'True/False' },
  { value: 'identification', label: 'Identification' },
  { value: 'fill_blank', label: 'Fill in the blank' },
]

export function QuestionForm({ draft, mode, errors, onChange }: { draft: QuestionDraft; mode: QuizMode; errors: QuestionErrors; onChange: (draft: QuestionDraft) => void }) {
  const blanks = detectBlankCount(draft.prompt)
  function patch(patchValue: Partial<QuestionDraft>) { onChange({ ...draft, ...patchValue }) }
  function changeType(type: QuestionType) {
    const options = type === 'true_false'
      ? [{ id: `true-${Date.now()}`, text: 'True', correct: false }, { id: `false-${Date.now()}`, text: 'False', correct: false }]
      : type === 'multiple_choice'
        ? [{ id: `option-a-${Date.now()}`, text: '', correct: false }, { id: `option-b-${Date.now()}`, text: '', correct: false }]
        : []
    onChange({ ...draft, type, options })
  }
  function updateOption(index: number, value: string) {
    patch({ options: draft.options.map((option, optionIndex) => optionIndex === index ? { ...option, text: value } : option) })
  }
  function addOption() {
    if (draft.options.length >= 6) return
    patch({ options: [...draft.options, { id: `option-${Date.now()}`, text: '', correct: false }] })
  }

  return <div className="question-form">
    {mode === 'quiz' ? <label className="field" htmlFor="question-type"><span className="field__label">Question type</span><select id="question-type" className="field__control field__control--select" value={draft.type} onChange={(event) => changeType(event.target.value as QuestionType)}>{questionTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select>{errors.type && <span className="field__error" role="alert">{errors.type}</span>}</label> : <p className="question-mode-label"><strong>Flashcard</strong><span>Front and back · self-rated recall</span></p>}
    <Input label={draft.type === 'flashcard' ? 'Front' : 'Prompt'} name="question-prompt" maxLength={2000} value={draft.prompt} onChange={(event) => { const prompt = event.target.value; patch({ prompt, ...(draft.type === 'fill_blank' ? { blankAnswers: Array.from({ length: detectBlankCount(prompt) }, (_, index) => draft.blankAnswers[index] ?? '') } : {}) }) }} error={errors.prompt} hint={draft.type === 'fill_blank' ? 'Type ___ (three underscores) wherever a blank belongs.' : undefined} />
    {draft.type === 'multiple_choice' || draft.type === 'true_false' ? <fieldset className="question-options"><legend>Answer options <span>Choose the correct answer.</span></legend>{draft.options.map((option, index) => <div className="question-option" key={option.id}><label className="question-option__correct"><input type="radio" name="correct-answer" aria-label={`Mark ${option.text || `option ${index + 1}`} as correct`} checked={option.correct} onChange={() => patch({ options: draft.options.map((item, itemIndex) => ({ ...item, correct: itemIndex === index })) })} /><span>Correct</span></label>{draft.type === 'true_false' ? <strong>{option.text}</strong> : <Input label={`Option ${index + 1}`} name={`option-${index + 1}`} maxLength={500} value={option.text} onChange={(event) => updateOption(index, event.target.value)} />}{draft.type === 'multiple_choice' && draft.options.length > 2 && <button type="button" className="icon-button" aria-label={`Remove option ${index + 1}`} onClick={() => patch({ options: draft.options.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={17} aria-hidden="true" /></button>}</div>)}{errors.options && <span className="field__error" role="alert">{errors.options}</span>}{draft.type === 'multiple_choice' && <button type="button" className="button button--secondary" disabled={draft.options.length >= 6} onClick={addOption}><Plus size={16} aria-hidden="true" /> Add option</button>}</fieldset> : null}
    {draft.type === 'identification' && <label className="field" htmlFor="accepted-answers"><span className="field__label">Accepted answers</span><textarea id="accepted-answers" className="field__control field__control--textarea" rows={3} value={draft.acceptedAnswers} onChange={(event) => patch({ acceptedAnswers: event.target.value })} aria-invalid={Boolean(errors.acceptedAnswers)} aria-describedby="accepted-answers-hint" /><span id="accepted-answers-hint" className="field__hint">Enter one accepted answer per line.</span>{errors.acceptedAnswers && <span className="field__error" role="alert">{errors.acceptedAnswers}</span>}</label>}
    {draft.type === 'fill_blank' && <div className="question-blank-fields"><strong>Blank answers</strong>{blanks === 0 ? <p>Add ___ in your prompt to create a blank.</p> : Array.from({ length: blanks }, (_, index) => <label className="field" key={index} htmlFor={`blank-answer-${index}`}><span className="field__label">Blank {index + 1} · accepted answers</span><textarea id={`blank-answer-${index}`} className="field__control field__control--textarea" rows={2} value={draft.blankAnswers[index] ?? ''} onChange={(event) => patch({ blankAnswers: Array.from({ length: blanks }, (_, answerIndex) => answerIndex === index ? event.target.value : draft.blankAnswers[answerIndex] ?? '') })} /></label>)}{errors.blanks && <span className="field__error" role="alert">{errors.blanks}</span>}</div>}
    {draft.type === 'flashcard' && <Input label="Back" name="flashcard-back" value={draft.back} onChange={(event) => patch({ back: event.target.value })} error={errors.back} />}
    <Input label="Points" name="question-points" type="number" min={1} step={1} value={draft.points} onChange={(event) => patch({ points: event.target.value })} error={errors.points} />
    <label className="field" htmlFor="question-explanation"><span className="field__label">Explanation <span className="field__hint-inline">Optional</span></span><textarea id="question-explanation" className="field__control field__control--textarea" rows={3} value={draft.explanation} onChange={(event) => patch({ explanation: event.target.value })} /></label>
    {(draft.type === 'identification' || draft.type === 'fill_blank') && <label className="choice-control"><input type="checkbox" checked={draft.caseSensitive} onChange={(event) => patch({ caseSensitive: event.target.checked })} /><span className="choice-control__mark" aria-hidden="true" /><span className="choice-control__copy"><strong>Answers are case-sensitive</strong></span></label>}
  </div>
}

export function QuestionPreview({ draft, explanationTiming }: { draft: QuestionDraft; explanationTiming: 'after_each' | 'after_submit' | 'never' }) {
  const promptParts = draft.prompt.split(/(___)/g)
  return <section className="question-preview" aria-labelledby="question-preview-title"><h3 id="question-preview-title">Preview as student</h3><div className="question-preview__canvas"><span className="section-kicker">QUESTION</span><p>{promptParts.map((part, index) => part === '___' ? <span className="question-preview__blank" key={index}>Your answer</span> : <span key={index}>{part}</span>)}</p>{draft.type === 'multiple_choice' || draft.type === 'true_false' ? <ul>{draft.options.map((option) => <li key={option.id}>{option.text || 'Answer option'}</li>)}</ul> : null}{draft.type === 'identification' && <p className="question-preview__response">Your answer</p>}{draft.type === 'flashcard' && <div className="question-preview__back"><strong>Back · after flip</strong><span>{draft.back || 'The answer appears here.'}</span></div>}{draft.type !== 'flashcard' && explanationTiming !== 'never' && draft.explanation && <div className="question-preview__explanation"><strong>{explanationTiming === 'after_each' ? 'After this answer · explanation' : 'After quiz submission · explanation'}</strong><span>{draft.explanation}</span></div>}<small>{draft.points || 1} {Number(draft.points) === 1 ? 'point' : 'points'}</small></div></section>
}
