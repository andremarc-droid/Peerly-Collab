import { useState, type FormEvent } from 'react'
import { LogOut, Save, Trash2 } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { Input } from '../../shared/ui/Input'
import { PageHeader } from '../../shared/ui/PageHeader'
import { SectionCard } from '../../shared/ui/SectionCard'
import { updateProfile } from 'firebase/auth'
import { clearRoleIntent } from '../auth/roleIntent'
import { hasPasswordProvider, signOutCurrentUser } from '../auth/authService'
import { useAuth } from '../auth/useAuth'
import { mapFirebaseAuthError } from '../auth/authErrors'
import { useUserProfile } from './useUserProfile'
import { deleteAccount } from './accountDeletion'
import { beginAccountDeletion, endAccountDeletion } from './accountDeletionState'
import { DeleteAccountDialog } from './DeleteAccountDialog'
import { AppShell, AppShellLoading } from '../../app/AppShell'
import { clearReturnTo } from '../../app/returnTo'

export function ProfilePage() {
  const { user, status, profileStatus, profileError, retryProfileSetup } = useAuth()
  const { profile, loading, error } = useUserProfile()
  const navigate = useNavigate()
  const [editedName, setEditedName] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | undefined>()
  const [requestError, setRequestError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const name = editedName ?? profile?.name ?? ''

  if (status === 'loading' || profileStatus === 'loading' || loading) return <AppShellLoading />
  if (status === 'signedOut' || !user) return <Navigate to="/role?mode=signin" replace />
  if (profileStatus === 'error') return <ProfileLoadError message={profileError ?? 'We couldn’t prepare your profile.'} onRetry={retryProfileSetup} />
  if (error) return <ProfileLoadError message={error} onRetry={retryProfileSetup} />
  if (!profile || !profile.role) return <Navigate to="/role?mode=continue" replace />

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedName = name.trim()
    if (!normalizedName) {
      setNameError('Enter your name.')
      return
    }
    if (normalizedName.length > 120) {
      setNameError('Keep your name under 120 characters.')
      return
    }
    if (!user) return
    setBusy(true)
    setRequestError(null)
    setNotice(null)
    try {
      await updateProfile(user, { displayName: normalizedName })
      const { updateProfileName } = await import('./profileService')
      await updateProfileName(user.uid, normalizedName)
      setEditedName(null)
      setNotice('Your profile has been updated.')
    } catch (saveError) {
      setRequestError(mapFirebaseAuthError(saveError))
    } finally {
      setBusy(false)
    }
  }

  async function handleSignOut() {
    setBusy(true)
    setRequestError(null)
    try {
      await signOutCurrentUser()
      clearRoleIntent()
      clearReturnTo()
      navigate('/role?mode=signin', { replace: true })
    } catch (signOutError) {
      setRequestError(mapFirebaseAuthError(signOutError))
    } finally {
      setBusy(false)
    }
  }

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
      // Once the sign-in is gone the page redirects to sign in on its own.
    } catch (deleteFailure) {
      setDeleteError(mapFirebaseAuthError(deleteFailure))
    } finally {
      endAccountDeletion()
      setDeleteBusy(false)
    }
  }

  return <AppShell>
    <PageHeader eyebrow="PROFILE & ACCOUNT" title="Profile settings" subtitle="Keep your learning identity up to date." />
    <main className="app-shell__content profile-page" id="main-content">
      <SectionCard title="Personal details" description="This information helps your learning space feel like yours." className="profile-card">
        {requestError && <Alert tone="error" label="Update not completed">{requestError}</Alert>}
        {notice && <Alert tone="success" label="Saved">{notice}</Alert>}
        <form className="auth-form profile-form" onSubmit={handleSave}>
          <div className="profile-details">
            <Input label="Display name" name="display-name" autoComplete="name" maxLength={120} value={name} onChange={(event) => { setEditedName(event.target.value); setNameError(undefined); setNotice(null) }} error={nameError} disabled={busy} />
            <Input label="Email address" name="email" type="email" value={profile.email ?? user.email ?? ''} readOnly />
            <div className="profile-role" aria-label="Account role, read only"><span>Account role</span><strong>{profile.role === 'instructor' ? 'Instructor' : 'Student'}</strong><small>Role can’t be changed from profile settings.</small></div>
          </div>
          <div className="profile-actions"><Button type="submit" variant="primary" disabled={busy}><Save size={16} aria-hidden="true" /> {busy ? 'Saving…' : 'Save profile'}</Button></div>
        </form>
      </SectionCard>
      <SectionCard title="Account access" description="Sign out when you’re finished on this device." className="profile-access-card">
        <div className="profile-actions"><Button type="button" variant="secondary" onClick={handleSignOut} disabled={busy}><LogOut size={16} aria-hidden="true" /> Sign out</Button></div>
      </SectionCard>
      <SectionCard title="Danger zone" description="Permanent actions that can’t be undone." icon={<Trash2 size={20} />} className="profile-access-card profile-danger-card">
        <div className="profile-danger">
          <div className="profile-danger__copy">
            <strong>Delete account</strong>
            <p>Permanently deletes your account, your data and your sign-in.</p>
          </div>
          <Button type="button" variant="secondary" className="button--destructive profile-danger__button" onClick={() => { setDeleteError(null); setDeleteOpen(true) }} disabled={busy || deleteBusy}><Trash2 size={16} aria-hidden="true" /> Delete account</Button>
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

function ProfileLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <AppShell><PageHeader eyebrow="PROFILE & ACCOUNT" title="Profile settings" subtitle="We couldn’t load your account details just yet." /><main className="app-shell__content profile-page"><SectionCard title="Profile unavailable" className="profile-error-card"><Alert tone="error" label="Profile unavailable">{message}</Alert><Button type="button" onClick={onRetry}>Try again</Button></SectionCard></main></AppShell>
}
