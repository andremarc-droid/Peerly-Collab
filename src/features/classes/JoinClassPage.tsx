import { AppShell } from '../../app/AppShell'
import { EmptyState } from '../../shared/ui/EmptyState'
import { PageHeader } from '../../shared/ui/PageHeader'

export function JoinClassPage() {
  return <AppShell>
    <PageHeader eyebrow="STUDENT SPACE" title="Join a class." subtitle="Class invitations will be ready here soon." />
    <main className="app-shell__content" id="main-content">
      <EmptyState title="Class joining is coming soon" description="Your instructor’s invitation link is ready. The student join flow will be available in the next release." />
    </main>
  </AppShell>
}
