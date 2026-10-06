import { Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../../shared/ui/Button'
import type { ClassWithId } from './types'
import { ClassActivityList } from './ClassActivityList'
import { filterActivities, type ActivityFeed } from './classActivities'

export function ClassQuizzesTab({ classroom, classes, feed }: { classroom: ClassWithId; classes: ClassWithId[]; feed: ActivityFeed }) {
  const createHref = `/instructor/quizzes/new?classId=${encodeURIComponent(classroom.id)}`
  const active = classroom.status === 'active'

  return (
    <section className="grid gap-5" aria-labelledby="class-quizzes-heading">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="section-kicker">CLASS PRACTICE</span>
          <h2 id="class-quizzes-heading" className="m-0 text-2xl">Quizzes</h2>
          <p className="m-0 mt-1 text-sm text-navy-800-72">
            Looking for canvas boards?{' '}
            <Link to="?tab=canvas" className="font-semibold text-navy-800 underline">Open the Canvas tab.</Link>
          </p>
        </div>
        {active
          ? <Button to={createHref}><Plus size={16} aria-hidden="true" /> Create quiz</Button>
          : <Button type="button" disabled>Restore this class before creating quizzes</Button>}
      </header>
      <ClassActivityList
        classroom={classroom}
        classes={classes}
        activities={filterActivities(feed.items, 'quizzes')}
        loading={feed.loading}
        error={feed.error}
        onRetry={feed.onRetry}
        errorLabel="Quizzes unavailable"
        emptyTitle="No quizzes in this class yet"
        emptyDescription="Create a quiz to give this class a focused place to practice."
        emptyAction={active
          ? <Button to={createHref}><Plus size={16} aria-hidden="true" /> Create quiz</Button>
          : <Button type="button" disabled>Restore class to create a quiz</Button>}
      />
    </section>
  )
}
