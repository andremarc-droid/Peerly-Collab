import { Plus } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { PageHeader } from '../../shared/ui/PageHeader'
import { StatRow, StatTile } from '../../shared/ui/StatTile'
import { useAuth } from '../auth/useAuth'
import { useUserProfile } from '../profile/useUserProfile'
import { AppShell } from '../../app/AppShell'

export function DashboardHome({ role }: { role: 'student' | 'instructor' }) {
  const { user } = useAuth()
  const { profile } = useUserProfile()
  const name = profile?.name || user?.displayName || user?.email || 'there'
  const instructor = role === 'instructor'

  return (
    <AppShell>
      <PageHeader eyebrow={instructor ? 'INSTRUCTOR HOME' : 'STUDENT HOME'} title={`Welcome, ${name}.`} subtitle={instructor ? 'Your teaching space is ready for the next great question.' : 'Your learning space is ready whenever practice is.'} action={instructor ? <Button disabled aria-label="Create your first quiz, coming soon"><Plus size={17} aria-hidden="true" /> Create your first quiz · Coming soon</Button> : undefined} />
      <main className="app-shell__content dashboard-home" id="main-content">
        <StatRow>
          {instructor ? <>
            <StatTile label="Quizzes" value="0" hint="No quizzes created yet" />
            <StatTile label="Learners" value="0" hint="Learners appear when invited" />
            <StatTile label="Responses" value="0" hint="Submissions appear here" />
            <StatTile label="Drafts" value="0" hint="Your future quiz drafts" />
          </> : <>
            <StatTile label="Quizzes shared" value="0" hint="Shared by your instructors" />
            <StatTile label="Practice sessions" value="0" hint="Ready when quizzes arrive" />
            <StatTile label="Questions mastered" value="0" hint="Practice builds progress" />
            <StatTile label="Study groups" value="0" hint="Learn together with others" />
          </>}
        </StatRow>
        <section className="dashboard-section">
          <div className="dashboard-section__heading"><div><span className="section-kicker">{instructor ? 'YOUR LIBRARY' : 'YOUR PRACTICE'}</span><h2>{instructor ? 'Quizzes' : 'Ready when you are'}</h2></div><span className="dashboard-section__count">0 items</span></div>
          <EmptyState title="Quizzes will appear here" description={instructor ? 'When you create a quiz, it will be ready to share with your learners here.' : 'Quizzes shared by an instructor will appear here. When one arrives, you can practice on your own or with a group.'} />
        </section>
      </main>
    </AppShell>
  )
}
