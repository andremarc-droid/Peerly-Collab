import { useEffect, useMemo, useState } from 'react'
import { BookmarkPlus, Eye, Search } from 'lucide-react'
import { Alert } from '../../../shared/ui/Alert'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { Input } from '../../../shared/ui/Input'
import { Skeleton } from '../../../shared/ui/Skeleton'
import { useToast } from '../../../shared/ui/useToast'
import { useAuth } from '../../auth/useAuth'
import { matchesPublicDeck } from '../schemas'
import { copyPublicDeckToLibrary, listPublicDecks } from '../services'
import type { PublicDeck, PublicDeckSortBy } from '../types'
import { PublicDeckPreviewDialog } from './PublicDeckPreviewDialog'
import { ReportDeckDialog } from './ReportDeckDialog'

export function PublicDecksTab() {
  const { user } = useAuth()
  const { showToast } = useToast()

  const [decks, setDecks] = useState<PublicDeck[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<PublicDeckSortBy>('newest')

  const [previewDeck, setPreviewDeck] = useState<PublicDeck | null>(null)
  const [reportDeck, setReportDeck] = useState<PublicDeck | null>(null)
  const [savingDeckId, setSavingDeckId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    listPublicDecks({ sortBy }, 100)
      .then(items => {
        if (!active) return
        setDecks(items)
      })
      .catch(err => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Could not load public decks.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [sortBy])

  const availableTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const d of decks) {
      for (const t of d.tags) {
        counts.set(t, (counts.get(t) ?? 0) + 1)
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([t]) => t)
  }, [decks])

  const filteredDecks = useMemo(() => {
    return decks.filter(d => matchesPublicDeck(d, search, selectedTag ?? undefined))
  }, [decks, search, selectedTag])

  const handleSaveToLibrary = async (deck: PublicDeck) => {
    if (!user) {
      showToast('error', 'Sign in to save this deck to your library.')
      return
    }
    setSavingDeckId(deck.id)
    try {
      await copyPublicDeckToLibrary(deck, user.uid)
      showToast('success', `Added “${deck.title}” to your library.`)
      setDecks(curr =>
        curr.map(d => (d.id === deck.id ? { ...d, savesCount: d.savesCount + 1 } : d)),
      )
      if (previewDeck?.id === deck.id) {
        setPreviewDeck(prev => (prev ? { ...prev, savesCount: prev.savesCount + 1 } : null))
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not save deck.')
    } finally {
      setSavingDeckId(null)
    }
  }

  return (
    <div className="grid gap-6">
      <header className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-xl font-bold text-navy-900">Explore public decks</h2>
            <p className="m-0 text-sm text-navy-900-72">
              Discover study material created by learners and educators across the community.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-navy-900">Sort:</span>
            <Button
              variant={sortBy === 'newest' ? 'primary' : 'secondary'}
              onClick={() => setSortBy('newest')}
            >
              Newest
            </Button>
            <Button
              variant={sortBy === 'mostSaved' ? 'primary' : 'secondary'}
              onClick={() => setSortBy('mostSaved')}
            >
              Most saved
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Input
            label="Search public decks"
            name="public-deck-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by title, subject, or author..."
            leadingIcon={<Search size={18} aria-hidden="true" />}
          />
        </div>

        {availableTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by subject tag">
            <button
              type="button"
              onClick={() => setSelectedTag(null)}
              className={`min-h-11 rounded-full px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-navy-900 ${
                selectedTag === null
                  ? 'bg-navy-900 text-white'
                  : 'bg-navy-900-08 text-navy-900 hover:bg-navy-900-15'
              }`}
            >
              All subjects
            </button>
            {availableTags.map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTag(current => (current === tag ? null : tag))}
                className={`min-h-11 rounded-full px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-navy-900 ${
                  selectedTag === tag
                    ? 'bg-navy-900 text-white'
                    : 'bg-navy-900-08 text-navy-900 hover:bg-navy-900-15'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </header>

      {error && <Alert tone="error" label="Could not load decks">{error}</Alert>}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-44 rounded-3xl" />
          <Skeleton className="h-44 rounded-3xl" />
          <Skeleton className="h-44 rounded-3xl" />
        </div>
      ) : filteredDecks.length === 0 ? (
        <EmptyState
          title="No public decks found"
          description={
            search || selectedTag
              ? 'Try adjusting your search terms or subject filters to find study decks.'
              : 'Be the first to publish a deck to the community! Open your deck settings to make it public.'
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDecks.map(deck => (
            <article
              key={deck.id}
              className="flex flex-col justify-between rounded-3xl border border-navy-900-15 bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-semibold text-navy-900-72">
                    By {deck.authorDisplayName}
                  </span>
                  <Badge>{deck.cardCount} cards</Badge>
                </div>

                <h3 className="m-0 text-lg font-bold text-navy-900 line-clamp-2">
                  {deck.title}
                </h3>

                {deck.description && (
                  <p className="mt-2 mb-3 text-sm text-navy-900-72 line-clamp-2">
                    {deck.description}
                  </p>
                )}

                {deck.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-4">
                    {deck.tags.slice(0, 3).map(tag => (
                      <Badge key={tag}>#{tag}</Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-navy-900-08 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-navy-900-72">
                  {deck.savesCount} {deck.savesCount === 1 ? 'save' : 'saves'}
                </span>

                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setPreviewDeck(deck)}
                    aria-label={`Preview ${deck.title}`}
                  >
                    <Eye size={16} aria-hidden="true" />
                    Preview
                  </Button>
                  <Button
                    variant="primary"
                    disabled={savingDeckId === deck.id}
                    onClick={() => void handleSaveToLibrary(deck)}
                    aria-label={`Add ${deck.title} to library`}
                  >
                    <BookmarkPlus size={16} aria-hidden="true" />
                    {savingDeckId === deck.id ? 'Adding…' : 'Add'}
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {previewDeck && (
        <PublicDeckPreviewDialog
          deck={previewDeck}
          open={previewDeck !== null}
          onClose={() => setPreviewDeck(null)}
          onSaveToLibrary={deck => void handleSaveToLibrary(deck)}
          onReport={deck => {
            setPreviewDeck(null)
            setReportDeck(deck)
          }}
          saving={savingDeckId === previewDeck.id}
        />
      )}

      {reportDeck && user && (
        <ReportDeckDialog
          deck={reportDeck}
          reporterUid={user.uid}
          open={reportDeck !== null}
          onClose={() => setReportDeck(null)}
          onSuccess={() => showToast('success', 'Thank you. Your report has been submitted for review.')}
        />
      )}
    </div>
  )
}
