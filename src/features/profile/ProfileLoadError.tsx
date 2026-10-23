import { AppShell } from '../../app/AppShell'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { PageHeader } from '../../shared/ui/PageHeader'
import { SectionCard } from '../../shared/ui/SectionCard'

/** Shown by the profile, settings and danger zone pages when the account details cannot be loaded. */
export function ProfileLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <AppShell><PageHeader eyebrow="PROFILE & ACCOUNT" title="Profile settings" subtitle="We couldn’t load your account details just yet." /><main className="app-shell__content profile-page"><SectionCard title="Profile unavailable" className="profile-error-card"><Alert tone="error" label="Profile unavailable">{message}</Alert><Button type="button" onClick={onRetry}>Try again</Button></SectionCard></main></AppShell>
}
