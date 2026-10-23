import { ArrowLeft, ChevronRight, Trash2 } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { AppShell, AppShellLoading } from '../../app/AppShell'
import { Button } from '../../shared/ui/Button'
import { PageHeader } from '../../shared/ui/PageHeader'
import { SectionCard } from '../../shared/ui/SectionCard'
import { useAuth } from '../auth/useAuth'
import { signedOutRedirectPath } from './accountDeletionState'
import { ProfileLoadError } from './ProfileLoadError'
import { useUserProfile } from './useUserProfile'

/** Profile → Settings. Permanent account actions are listed here and each one opens on its own page. */
export function SettingsPage() {
  const { user, status, profileStatus, profileError, retryProfileSetup } = useAuth()
  const { profile, loading, error } = useUserProfile()

  if (status === 'loading' || profileStatus === 'loading' || loading) return <AppShellLoading />
  if (status === 'signedOut' || !user) return <Navigate to={signedOutRedirectPath()} replace />
  if (profileStatus === 'error') return <ProfileLoadError message={profileError ?? 'We couldn’t prepare your profile.'} onRetry={retryProfileSetup} />
  if (error) return <ProfileLoadError message={error} onRetry={retryProfileSetup} />
  if (!profile || !profile.role) return <Navigate to="/role?mode=continue" replace />

  return <AppShell>
    <PageHeader
      eyebrow="PROFILE & ACCOUNT"
      title="Settings"
      subtitle="Permanent account actions live here so they stay out of everyday profile edits."
      action={<Button to="/profile" variant="secondary"><ArrowLeft size={17} aria-hidden="true" /> Back to profile</Button>}
      mobileAction={null}
    />
    <main className="app-shell__content profile-page" id="main-content">
      <SectionCard title="Danger zone" description="Actions here can’t be undone." icon={<Trash2 size={20} />} className="profile-access-card profile-settings-card">
        <div className="profile-danger">
          <div className="profile-danger__copy">
            <strong>Delete account</strong>
            <p>Permanently deletes your account, your data and your sign-in.</p>
          </div>
          <Button to="/profile/settings/danger-zone" variant="secondary" className="button--destructive profile-danger__button">Open danger zone <ChevronRight size={16} aria-hidden="true" /></Button>
        </div>
      </SectionCard>
    </main>
  </AppShell>
}
