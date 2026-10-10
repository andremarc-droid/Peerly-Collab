import type { StudyCard } from './queue'

export type QuizKind = 'multiple-choice' | 'written'
export interface QuizQuestion {
  id: string
  cardId?: string
  kind: QuizKind
  prompt: string
  answer: string
  options?: string[]
  correctIndex?: number
  explanation: string
}
export interface QuizBuildResult { questions: QuizQuestion[]; notice: string | null }
export type DistractorGenerator = (cards: StudyCard[]) => Promise<Record<string, string[]>>

function shuffled<T>(items: T[], random: () => number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!]
  }
  return result
}

export function localDistractors(
  card: StudyCard,
  cards: StudyCard[],
  random: () => number = Math.random,
): string[] {
  const correct = card.back.trim().toLocaleLowerCase()
  const answers = new Map<string, string>()
  for (const candidate of cards) {
    const answer = candidate.back.trim()
    const normalized = answer.toLocaleLowerCase()
    if (candidate.id !== card.id && answer && normalized !== correct && !answers.has(normalized)) {
      answers.set(normalized, answer)
    }
  }
  return shuffled([...answers.values()], random).slice(0, 3)
}

export async function buildQuiz(
  cards: StudyCard[],
  kinds: QuizKind[] = ['multiple-choice'],
  useAi = false,
  generate?: DistractorGenerator,
  requestedCount = cards.length,
  random: () => number = Math.random,
): Promise<QuizBuildResult> {
  if (!cards.length || requestedCount <= 0) return { questions: [], notice: null }

  const selectedCards = shuffled(cards, random).slice(0, Math.min(50, cards.length, Math.floor(requestedCount)))
  const selectedKinds = selectedCards.map((card, index) => ({
    card,
    kind: selectedCards.length === 1 ? 'written' as const : kinds[index % Math.max(1, kinds.length)] ?? 'multiple-choice',
  }))
  const multipleChoiceCards = selectedKinds.filter(item => item.kind === 'multiple-choice').map(item => item.card)
  let generated: Record<string, string[]> = {}
  let notice: string | null = null

  if (useAi && multipleChoiceCards.length && generate) {
    for (let start = 0; start < multipleChoiceCards.length; start += 15) {
      try {
        generated = { ...generated, ...await generate(multipleChoiceCards.slice(start, start + 15)) }
      } catch {
        notice = 'AI distractors were unavailable; local options were used where possible.'
        break
      }
    }
  } else if (useAi && multipleChoiceCards.length) {
    notice = 'AI distractors are unavailable; local options were used where possible.'
  }

  const questions = selectedKinds.map(({ card, kind }): QuizQuestion => {
    const correct = card.back.trim()
    if (kind === 'written') {
      return { id: `q-${card.id}`, cardId: card.id, kind, prompt: card.front, answer: correct, explanation: correct }
    }
    const candidates = [...(generated[card.id] ?? []), ...localDistractors(card, cards, random)]
    const seen = new Set([correct.toLocaleLowerCase()])
    const wrong = candidates
      .map(value => value.trim())
      .filter(value => {
        const normalized = value.toLocaleLowerCase()
        if (!normalized || seen.has(normalized)) return false
        seen.add(normalized)
        return true
      })
      .slice(0, 3)
    if (!wrong.length) {
      return { id: `q-${card.id}`, cardId: card.id, kind: 'written', prompt: card.front, answer: correct, explanation: correct }
    }
    const options = shuffled([correct, ...wrong], random)
    return { id: `q-${card.id}`, cardId: card.id, kind, prompt: card.front, answer: correct, options, correctIndex: options.indexOf(correct), explanation: correct }
  })
  return { questions, notice }
}
