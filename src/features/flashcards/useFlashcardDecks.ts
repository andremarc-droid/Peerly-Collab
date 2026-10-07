import { useEffect, useMemo, useState } from 'react'
import { sortDecksByUpdated, watchClassDecks, watchMyDecks } from './services'
import type { FlashcardDeckWithId } from './types'

interface UseFlashcardDecksOptions {
  role: 'instructor' | 'student'
  uid: string | undefined
  classIds: string[]
}

interface DeckState {
  /** Which role/user/classes this data belongs to; stale data is ignored. */
  key: string
  decks: Record<string, FlashcardDeckWithId[]>
  error: string | null
}

/**
 * Live flashcard decks across the given classes.
 * Instructors get their class decks; students get published class decks plus their own private decks.
 */
export function useFlashcardDecks({ role, uid, classIds }: UseFlashcardDecksOptions) {
  const classKey = classIds.join('|')
  const viewKey = `${role}:${uid ?? ''}:${classKey}`
  const [state, setState] = useState<DeckState>({ key: viewKey, decks: {}, error: null })

  useEffect(() => {
    if (!uid || !classKey) return undefined

    const update = (source: string, items: FlashcardDeckWithId[]) =>
      setState((prev) => {
        const same = prev.key === viewKey
        return {
          key: viewKey,
          decks: { ...(same ? prev.decks : {}), [source]: items },
          error: same ? prev.error : null,
        }
      })
    const fail = (message: string) =>
      setState((prev) => ({
        key: viewKey,
        decks: prev.key === viewKey ? prev.decks : {},
        error: message,
      }))

    const unsubs: Array<() => void> = []
    for (const classId of classKey.split('|')) {
      unsubs.push(
        watchClassDecks(
          classId,
          role,
          (items) => update(`class:${classId}`, items),
          (err) => fail(err.message),
        ),
      )
      if (role === 'student') {
        unsubs.push(
          watchMyDecks(
            classId,
            uid,
            (items) => update(`mine:${classId}`, items),
            (err) => fail(err.message),
          ),
        )
      }
    }
    return () => unsubs.forEach((unsubscribe) => unsubscribe())
  }, [classKey, role, uid, viewKey])

  const current = state.key === viewKey ? state : null
  const decks = useMemo(
    () => (current ? sortDecksByUpdated(Object.values(current.decks).flat()) : []),
    [current],
  )

  return { decks, error: current?.error ?? null }
}
