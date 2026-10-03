import { useState, type FormEvent } from 'react'
import { LogOut, Save } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { Input } from '../../shared/ui/Input'
import { PageHeader } from '../../shared/ui/PageHeader'
import { SectionCard } from '../../shared/ui/SectionCard'
import { updateProfile } from 'firebase/auth'
import { clearRoleIntent } from '../auth/roleIntent'
import { signOutCurrentUser } from '../auth/authService'
import { useAuth } from '../auth/useAuth'
import { mapFirebaseAuthError } from '../auth/authErrors'
import { useUserProfile } from './useUserProfile'
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

  return <AppShell>
    <PageHeader eyebrow="PROFILE & ACCOUNT" title="Profile settings" subtitle="Keep your learning identity up to date." />
    <main className="app-shell__content profile-page" id="main-content">
      <SectionCard title="Personal details" description="This information helps your learning space feel like yours." className="profile-card">
        {requestError && <Alert tone="error" label="Update not completed">{requestError}</Alert>}
        {notice && <Alert tone="success" label="Saved">{notice}</Alert>}
        <form className="auth-form profile-form" onSubmit={handleSave}>
          <div className="profile-details">
            <Input label="Display name" name="display-name" autoComplete="name" value={name} onChange={(event) => { setEditedName(event.target.value); setNameError(undefined); setNotice(null) }} error={nameError} disabled={busy} />
            <Input label="Email address" name="email" type="email" value={profile.email ?? user.email ?? ''} readOnly />
            <div className="profile-role" aria-label="Account role, read only"><span>Account role</span><strong>{profile.role === 'instructor' ? 'Instructor' : 'Student'}</strong><small>Role can’t be changed from profile settings.</small></div>
          </div>
          <div className="profile-actions"><Button type="submit" variant="primary" disabled={busy}><Save size={16} aria-hidden="true" /> {busy ? 'Saving…' : 'Save profile'}</Button></div>
        </form>
      </SectionCard>
      <SectionCard title="Account access" description="Sign out when you’re finished on this device." className="profile-access-card">
        <div className="profile-actions"><Button type="button" variant="secondary" onClick={handleSignOut} disabled={busy}><LogOut size={16} aria-hidden="true" /> Sign out</Button></div>
      </SectionCard>
    </main>
  </AppShell>
}

function ProfileLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <AppShell><PageHeader eyebrow="PROFILE & ACCOUNT" title="Profile settings" subtitle="We couldn’t load your account details just yet." /><main className="app-shell__content profile-page"><SectionCard title="Profile unavailable" className="profile-error-card"><Alert tone="error" label="Profile unavailable">{message}</Alert><Button type="button" onClick={onRetry}>Try again</Button></SectionCard></main></AppShell>
}
