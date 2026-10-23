import { useState } from 'react'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { AppShell, AppShellLoading } from '../../app/AppShell'
import { clearReturnTo } from '../../app/returnTo'
import { Button } from '../../shared/ui/Button'
import { PageHeader } from '../../shared/ui/PageHeader'
import { SectionCard } from '../../shared/ui/SectionCard'
import { mapFirebaseAuthError } from '../auth/authErrors'
import { hasPasswordProvider } from '../auth/authService'
import { clearRoleIntent } from '../auth/roleIntent'
import { useAuth } from '../auth/useAuth'
import { deleteAccount } from './accountDeletion'
import { beginAccountDeletion, endAccountDeletion, signedOutRedirectPath } from './accountDeletionState'
import { DeleteAccountDialog } from './DeleteAccountDialog'
import { ProfileLoadError } from './ProfileLoadError'
import { useUserProfile } from './useUserProfile'

/** Profile → Settings → Danger zone. The only place an account can be deleted. */
export function DangerZonePage() {
  const { user, status, profileStatus, profileError, retryProfileSetup } = useAuth()
  const { profile, loading, error } = useUserProfile()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  if (status === 'loading' || profileStatus === 'loading' || loading) return <AppShellLoading />
  if (status === 'signedOut' || !user) return <Navigate to={signedOutRedirectPath()} replace />
  if (profileStatus === 'error') return <ProfileLoadError message={profileError ?? 'We couldn’t prepare your profile.'} onRetry={retryProfileSetup} />
  if (error) return <ProfileLoadError message={error} onRetry={retryProfileSetup} />
  if (!profile || !profile.role) return <Navigate to="/role?mode=continue" replace />

  async function handleDeleteAccount(password: string) {
    const role = profile?.role
    if (!user || !role) return
    setDeleteBusy(true)
    setDeleteError(null)
    beginAccountDeletion()
    try {
      // Removes the data in Firestore first, then the Firebase Authentication account.
      await deleteAccount({ user, role, password })
      clearRoleIntent()
      clearReturnTo()
      // Once the sign-in is gone the app sends the person to the landing page on its own.
    } catch (deleteFailure) {
      console.error('Account deletion failed', deleteFailure)
      setDeleteError(mapFirebaseAuthError(deleteFailure))
    } finally {
      endAccountDeletion()
      setDeleteBusy(false)
    }
  }

  return <AppShell>
    <PageHeader
      eyebrow="PROFILE & ACCOUNT"
      title="Danger zone"
      subtitle="Actions on this page are permanent and can’t be undone."
      action={<Button to="/profile/settings" variant="secondary"><ArrowLeft size={17} aria-hidden="true" /> Back to settings</Button>}
      mobileAction={null}
    />
    <main className="app-shell__content profile-page" id="main-content">
      <SectionCard title="Delete account" description="You’ll be asked to confirm before anything is deleted." icon={<Trash2 size={20} />} className="profile-access-card profile-settings-card">
        <div className="profile-danger">
          <div className="profile-danger__copy">
            <strong>This action is permanent</strong>
            <p>Permanently deletes your account, your data and your sign-in.</p>
          </div>
          <Button type="button" variant="secondary" className="button--destructive profile-danger__button" onClick={() => { setDeleteError(null); setDeleteOpen(true) }} disabled={deleteBusy}><Trash2 size={16} aria-hidden="true" /> Delete account</Button>
        </div>
      </SectionCard>
    </main>
    <DeleteAccountDialog
      open={deleteOpen}
      onClose={() => { setDeleteOpen(false); setDeleteError(null) }}
      onConfirm={handleDeleteAccount}
      email={profile.email ?? user.email ?? ''}
      role={profile.role}
      needsPassword={hasPasswordProvider(user)}
      busy={deleteBusy}
      error={deleteError}
    />
  </AppShell>
}
