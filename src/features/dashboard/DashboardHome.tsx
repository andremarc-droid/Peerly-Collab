import { ArrowRight, BookOpenCheck } from 'lucide-react'
import { Badge } from '../../shared/ui/Badge'
import { Card } from '../../shared/ui/Card'
import { useAuth } from '../auth/useAuth'
import { useUserProfile } from '../profile/useUserProfile'
import { AppShell } from '../../app/AppShell'

export function DashboardHome({ role }: { role: 'student' | 'instructor' }) {
  const { user } = useAuth()
  const { profile } = useUserProfile()
  const name = profile?.name || user?.displayName || 'there'
  const instructor = role === 'instructor'

  return (
    <AppShell>
      <main className="dashboard-home" id="main-content">
        <div className="dashboard-home__heading">
          <Badge>{instructor ? 'INSTRUCTOR SPACE' : 'STUDENT SPACE'}</Badge>
          <h1>Welcome, {name}.</h1>
          <p>{instructor ? 'Your learning space is ready for the next great question.' : 'Your next moment of practice starts here.'}</p>
        </div>
        <Card className="dashboard-empty" elevated>
          <span className="dashboard-empty__icon"><BookOpenCheck size={24} aria-hidden="true" /></span>
          <h2>Quizzes will appear here</h2>
          <p>{instructor ? 'When you create a quiz, you’ll find it here.' : 'When an instructor shares a quiz with you, it’ll show up here.'}</p>
          <span className="dashboard-empty__note">A little practice goes a long way <ArrowRight size={15} aria-hidden="true" /></span>
        </Card>
      </main>
    </AppShell>
  )
}
