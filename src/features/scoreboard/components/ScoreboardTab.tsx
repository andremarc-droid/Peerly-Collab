import { useEffect, useState, useCallback } from 'react'
import { ChevronDown, Eye, Trophy, User } from 'lucide-react'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { Skeleton } from '../../../shared/ui/Skeleton'
import { useAuth } from '../../auth/useAuth'
import { resolveScoreboardOptIn } from '../schemas'
import {
  callEnsureScoreboardEntry,
  listScoreboardEntries,
  recordScoreboardNoticeSeen,
} from '../services'
import type { ScoreboardEntry, ScoreboardPeriod } from '../types'

export function ScoreboardTab() {
  const { user, profile } = useAuth()
  const [period, setPeriod] = useState<ScoreboardPeriod>('allTime')
  const [entries, setEntries] = useState<ScoreboardEntry[]>([])
  const [userEntry, setUserEntry] = useState<ScoreboardEntry | undefined>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [limitCount, setLimitCount] = useState(50)
  const [hasMore, setHasMore] = useState(false)
  const [noticeDismissed, setNoticeDismissed] = useState(false)

  const isOptedIn = resolveScoreboardOptIn(profile)
  const isMinor = profile?.role === 'student' && typeof profile?.age === 'number' && profile.age < 18
  const isAdultOrInstructor = !isMinor
  const shouldShowNotice =
    Boolean(user && profile && isAdultOrInstructor && !profile.scoreboardNoticeSeenAt && !noticeDismissed)

  const loadData = useCallback(async (active: { current: boolean }) => {
    setLoading(true)
    setError(null)
    try {
      const res = await listScoreboardEntries(period, limitCount, user?.uid)
      if (!active.current) return
      setEntries(res.entries)
      setUserEntry(res.userEntry)
      setHasMore(res.entries.length >= limitCount)

      // Self-heal: if signed-in user has no entry but is opted in, ensure entry once per session
      if (user && !res.userEntry && isOptedIn) {
        const sessionKey = `peerly:scoreboard:ensured:${user.uid}`
        if (!sessionStorage.getItem(sessionKey)) {
          sessionStorage.setItem(sessionKey, '1')
          void callEnsureScoreboardEntry()
            .then(async (ensured) => {
              if (ensured.created && active.current) {
                const refreshed = await listScoreboardEntries(period, limitCount, user.uid)
                if (active.current) {
                  setEntries(refreshed.entries)
                  setUserEntry(refreshed.userEntry)
                }
              }
            })
            .catch(() => {})
        }
      }
    } catch (err) {
      if (active.current) {
        setError(err instanceof Error ? err.message : 'Could not load scoreboard.')
      }
    } finally {
      if (active.current) setLoading(false)
    }
  }, [isOptedIn, limitCount, period, user])

  useEffect(() => {
    const active = { current: true }
    void loadData(active)
    return () => {
      active.current = false
    }
  }, [loadData])

  const handleDismissNotice = async () => {
    setNoticeDismissed(true)
    if (user) {
      await recordScoreboardNoticeSeen(user.uid).catch(() => {})
    }
  }

  return (
    <div className="grid gap-6">
      {/* One-time public scoreboard notice for adult users */}
      {shouldShowNotice && (
        <aside
          className="rounded-3xl border border-navy-900-15 bg-white p-5 shadow-sm flex flex-wrap items-center justify-between gap-4"
          aria-label="Public Scoreboard Notice"
        >
          <div className="flex items-start gap-3 max-w-2xl">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-navy-900-10 text-navy-900">
              <Eye size={20} aria-hidden="true" />
            </div>
            <div>
              <strong className="block text-base font-bold text-navy-900">
                You're on the public scoreboard
              </strong>
              <p className="m-0 text-sm text-navy-900-72 mt-0.5">
                Your chosen display name, avatar, and study points are visible to celebrate learning
                consistency. You can customize your name or hide yourself at any time in Settings.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button to="/profile/settings" variant="secondary" className="min-h-11">
              Review privacy settings
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => void handleDismissNotice()}
              className="min-h-11"
            >
              Got it
            </Button>
          </div>
        </aside>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="m-0 text-2xl font-bold text-navy-900">Scoreboard</h2>
          <p className="m-0 text-base text-navy-900 mt-1">
            Celebrate study milestones and consistency across Peerly Collab.
          </p>
        </div>

        <div className="flex gap-2" role="tablist" aria-label="Scoreboard period tabs">
          <button
            type="button"
            role="tab"
            aria-selected={period === 'allTime'}
            onClick={() => {
              setPeriod('allTime')
              setLimitCount(50)
            }}
            className={`min-h-11 rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-navy-900 ${
              period === 'allTime'
                ? 'bg-navy-900 text-white'
                : 'bg-navy-900-08 text-navy-900 hover:bg-navy-900-15'
            }`}
          >
            All time
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={period === 'weekly'}
            onClick={() => {
              setPeriod('weekly')
              setLimitCount(50)
            }}
            className={`min-h-11 rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-navy-900 ${
              period === 'weekly'
                ? 'bg-navy-900 text-white'
                : 'bg-navy-900-08 text-navy-900 hover:bg-navy-900-15'
            }`}
          >
            This week
          </button>
        </div>
      </div>

      {error && <Alert tone="error" label="Error">{error}</Alert>}

      {/* Current user's standing banner */}
      {user && (
        <section
          className="rounded-3xl border border-navy-900-15 bg-white p-5 shadow-sm flex flex-wrap items-center justify-between gap-4"
          aria-label="Your standing"
        >
          {!isOptedIn ? (
            <>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-900-10 text-navy-900 font-bold text-lg">
                  —
                </div>
                <div>
                  <span className="text-xs uppercase font-bold tracking-wider text-navy-900-72">Your standing</span>
                  <h3 className="m-0 text-lg font-bold text-navy-900">
                    You're hidden from the scoreboard
                  </h3>
                  <p className="m-0 text-xs text-navy-900-72">
                    Your study points and display name are private.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Button to="/profile/settings" variant="secondary" className="min-h-11">
                  Settings & Privacy
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-900 text-white font-bold text-lg">
                  {userEntry?.rank ? `#${userEntry.rank}` : '—'}
                </div>
                <div>
                  <span className="text-xs uppercase font-bold tracking-wider text-navy-900-72">Your standing</span>
                  <h3 className="m-0 text-lg font-bold text-navy-900">
                    {userEntry ? userEntry.displayName : (user.displayName || 'You')}
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <span className="text-2xl font-extrabold text-navy-900">
                    {userEntry?.points ?? 0}
                  </span>
                  <span className="text-xs text-navy-900-72 block">points</span>
                </div>
                <Button to="/profile/settings" variant="secondary" className="min-h-11">
                  Settings & Privacy
                </Button>
              </div>
            </>
          )}
        </section>
      )}

      {/* Rankings list */}
      <section className="rounded-3xl border border-navy-900-15 bg-white p-6 shadow-sm grid gap-4">
        <h3 className="m-0 text-xl font-bold text-navy-900 flex items-center gap-2">
          <Trophy size={20} className="text-navy-900" aria-hidden="true" />
          Top Learners ({period === 'weekly' ? 'This week' : 'All time'})
        </h3>

        {loading ? (
          <div className="grid gap-3">
            <Skeleton className="h-14 rounded-2xl" />
            <Skeleton className="h-14 rounded-2xl" />
            <Skeleton className="h-14 rounded-2xl" />
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            title="No scoreboard entries yet"
            description="Complete study sessions, practice flashcards, and submit quizzes to earn points!"
          />
        ) : (
          <div className="grid gap-2" role="feed" aria-label="Scoreboard rankings">
            {entries.map((entry) => {
              const isCurrentUser = entry.uid === user?.uid
              const rank = entry.rank ?? 0
              return (
                <article
                  key={entry.uid}
                  className={`flex items-center justify-between gap-4 rounded-2xl p-4 transition ${
                    isCurrentUser
                      ? 'border-2 border-navy-900 bg-navy-900-08 font-bold'
                      : 'border border-navy-900-10 bg-white hover:bg-navy-900-05'
                  }`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy-900-10 font-bold text-sm text-navy-900">
                      {rank === 1 ? '1st' : rank === 2 ? '2nd' : rank === 3 ? '3rd' : `#${rank}`}
                    </div>

                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-900-15 text-navy-900 overflow-hidden font-bold">
                      {entry.avatar ? (
                        <img
                          src={entry.avatar}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        entry.displayName.slice(0, 1).toUpperCase() || <User size={18} />
                      )}
                    </div>

                    <div className="min-w-0">
                      <span className="block truncate font-bold text-base text-navy-900">
                        {entry.displayName} {isCurrentUser && '(You)'}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-lg font-bold text-navy-900">
                      {entry.points}
                    </span>
                    <span className="text-xs text-navy-900-72 block">pts</span>
                  </div>
                </article>
              )
            })}

            {hasMore && (
              <div className="mt-4 text-center">
                <Button
                  variant="secondary"
                  onClick={() => setLimitCount((prev) => prev + 50)}
                  className="min-h-11"
                >
                  <ChevronDown size={16} aria-hidden="true" />
                  Load more
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Privacy note banner */}
      <footer className="rounded-2xl border border-navy-900-15 bg-navy-900-05 p-4 text-sm text-navy-900">
        <p className="m-0">
          <strong>Privacy note:</strong> The scoreboard displays only your chosen display name, avatar, and study points. Your email, age, classes, and specific answers are never shown. To adjust your scoreboard name or turn off your visibility, visit{' '}
          <a href="/profile/settings" className="font-semibold text-navy-900 underline">
            Profile Settings
          </a>.
        </p>
      </footer>
    </div>
  )
}
