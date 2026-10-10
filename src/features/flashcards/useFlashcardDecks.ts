import { useEffect, useMemo, useState } from 'react'
import { sortDecksByUpdated, watchMyDecks } from './services'
import { watchSharedDecks } from './sharing'
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
 * Live personal and shared decks. Class decks are intentionally excluded from Learning.
 */
export function useFlashcardDecks({ role, uid, classIds }: UseFlashcardDecksOptions) {
  const classKey = classIds.join('|')
  const viewKey = `${role}:${uid ?? ''}:${classKey}`
  const [state, setState] = useState<DeckState>({ key: viewKey, decks: {}, error: null })

  useEffect(() => {
    if (!uid) return undefined

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
    unsubs.push(watchSharedDecks(uid, (items) => update('shared', items), (err) => fail(err.message)))
    if (classKey.split('|').includes(uid)) {
      unsubs.push(watchMyDecks(uid, uid, (items) => update(`mine:${uid}`, items), (err) => fail(err.message)))
    }
    return () => unsubs.forEach((unsubscribe) => unsubscribe())
  }, [classKey, role, uid, viewKey])

  const current = state.key === viewKey ? state : null
  const decks = useMemo(
    () => {
      if (!current) return []
      const unique = new Map<string, FlashcardDeckWithId>()
      for (const deck of Object.values(current.decks).flat()) {
        const key = `${deck.classId}/${deck.id}`
        const existing = unique.get(key)
        if (!existing || deck.sharedRole) unique.set(key, deck)
      }
      return sortDecksByUpdated([...unique.values()])
    },
    [current],
  )

  return { decks, error: current?.error ?? null }
}
