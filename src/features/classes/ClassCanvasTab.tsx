import { Plus } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import type { ClassWithId } from './types'
import { ClassActivityList } from './ClassActivityList'
import { filterActivities, type ActivityFeed } from './classActivities'

export function ClassCanvasTab({ classroom, classes, feed }: { classroom: ClassWithId; classes: ClassWithId[]; feed: ActivityFeed }) {
  const createHref = `/instructor/quizzes/new?classId=${encodeURIComponent(classroom.id)}&mode=canvas`
  const active = classroom.status === 'active'

  return (
    <section className="grid gap-5" aria-labelledby="class-canvas-heading">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="section-kicker">CONCEPT BOARDS</span>
          <h2 id="class-canvas-heading" className="m-0 text-2xl">Canvas activities</h2>
        </div>
        {active
          ? <Button to={createHref}><Plus size={16} aria-hidden="true" /> Create canvas</Button>
          : <Button type="button" disabled>Restore this class before creating canvas activities</Button>}
      </header>
      <ClassActivityList
        classroom={classroom}
        classes={classes}
        activities={filterActivities(feed.items, 'canvas')}
        loading={feed.loading}
        error={feed.error}
        onRetry={feed.onRetry}
        errorLabel="Canvas activities unavailable"
        emptyTitle="No canvas activities yet"
        emptyDescription="Students connect related cards on a board and are graded on their connections."
        emptyAction={active
          ? <Button to={createHref}><Plus size={16} aria-hidden="true" /> Create canvas</Button>
          : <Button type="button" disabled>Restore class to create a canvas</Button>}
      />
    </section>
  )
}
