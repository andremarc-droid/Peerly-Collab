import { useEffect, useState } from 'react'
import { Flame, Sparkles, TrendingUp } from 'lucide-react'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { Dialog } from '../../shared/ui/Dialog'
import { Select } from '../../shared/ui/Select'
import { Skeleton } from '../../shared/ui/Skeleton'
import { StatRow, StatTile } from '../../shared/ui/StatTile'
import { levelProgress } from './level'
import { localDayKey, visibleStreak } from './streak'
import { setDailyGoalXp, watchStats } from './services'
import { XP_AWARDS } from './xp'
import type { DailyGoalXp, StatsSummary } from './schemas'

const goalOptions = XP_AWARDS.dailyGoals.map(value => ({ value: String(value), label: `${value} XP per day` }))

export function StatsHome({ uid }: { uid: string }) {
  const [stats, setStats] = useState<StatsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [goalOpen, setGoalOpen] = useState(false)
  const [goal, setGoal] = useState<DailyGoalXp>(XP_AWARDS.dailyGoalDefault)
  const [saving, setSaving] = useState(false)
  const [goalError, setGoalError] = useState<string | null>(null)
  const [today] = useState(() => localDayKey(new Date()))

  useEffect(() => {
    if (!uid) return undefined
    return watchStats(uid, value => { setStats(value); setGoal(value.dailyGoalXp); setLoading(false); setError(null) }, cause => { setError(cause.message); setLoading(false) })
  }, [uid])

  const saveGoal = async () => {
    if (!uid) return
    setSaving(true); setGoalError(null)
    try { await setDailyGoalXp(uid, goal); setGoalOpen(false) }
    catch (cause) { setGoalError(cause instanceof Error ? cause.message : 'Could not save your daily goal.') }
    finally { setSaving(false) }
  }

  if (loading) return <section className="grid gap-3" aria-label="Study streak and XP"><Skeleton className="h-28 rounded-2xl"/><p role="status" className="m-0 text-base text-navy-900">Loading your study stats…</p></section>
  if (error || !stats) return <Alert tone="error" label="Study stats">{error ?? 'Your stats are unavailable right now.'}</Alert>

  const streak = visibleStreak(stats.currentStreak, stats.lastActiveDay, today)
  const level = levelProgress(stats.xp)
  const goalReached = stats.today.xp >= stats.dailyGoalXp
  const progressValue = Math.min(stats.today.xp, stats.dailyGoalXp)

  return <section className="grid min-w-0 gap-3" aria-label="Study streak and XP">
    <StatRow label="Your study stats">
      <StatTile label="Streak" value={`${streak} ${streak === 1 ? 'day' : 'days'}`} hint="Consecutive local study days" icon={<Flame size={17}/>}/>
      <StatTile label="Level" value={`Level ${level.level}`} hint={`${level.xpToNextLevel} XP to the next level`} icon={<TrendingUp size={17}/>}/>
      <StatTile label="Total XP" value={String(stats.xp)} hint={`${stats.totalReviews} card reviews`} icon={<Sparkles size={17}/>}/>
    </StatRow>
    <section className="grid min-w-0 gap-3 rounded-3xl border border-navy-900-15 bg-white p-5 shadow-sm" aria-labelledby="daily-goal-heading">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3"><h2 id="daily-goal-heading" className="m-0 text-lg font-bold text-navy-900">Daily goal</h2><Button variant="secondary" onClick={() => { setGoal(stats.dailyGoalXp); setGoalError(null); setGoalOpen(true) }}>Change goal</Button></div>
      <p className="m-0 break-words text-base text-navy-900">{stats.today.xp} of {stats.dailyGoalXp} XP today</p>
      <progress className="h-3 w-full accent-navy-900" max={stats.dailyGoalXp} value={progressValue} aria-label={`Daily goal progress: ${progressValue} of ${stats.dailyGoalXp} XP`}>{progressValue} of {stats.dailyGoalXp} XP</progress>
      {goalReached && <p className="m-0 text-base font-semibold text-navy-900" role="status">Daily goal reached. Nice work keeping your learning moving.</p>}
      {!goalReached && <p className="m-0 text-base text-navy-900">{Math.max(0, stats.dailyGoalXp - stats.today.xp)} XP left to reach your goal.</p>}
      <p className="m-0 text-sm text-navy-900">Level progress: {level.xpIntoLevel} of {level.xpForNextLevel} XP · {level.xpToNextLevel} XP to Level {level.level + 1}</p>
    </section>
    <Dialog open={goalOpen} onClose={() => { if (!saving) setGoalOpen(false) }} title="Choose a daily XP goal" description="A small, steady target can help you build a learning habit.">
      <div className="grid gap-4">
        <Select label="Daily goal" value={String(goal)} onChange={event => setGoal(Number(event.target.value) as DailyGoalXp)} options={goalOptions}/>
        {goalError && <Alert tone="error" label="Goal not saved">{goalError}</Alert>}
        <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={saving} onClick={() => setGoalOpen(false)}>Cancel</Button><Button variant="primary" disabled={saving} onClick={() => void saveGoal()}>{saving ? 'Saving…' : 'Save goal'}</Button></div>
      </div>
    </Dialog>
  </section>
}
