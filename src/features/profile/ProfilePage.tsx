import { useState, type FormEvent } from 'react'
import { LogOut, Save } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { Card } from '../../shared/ui/Card'
import { Input } from '../../shared/ui/Input'
import { Spinner } from '../../shared/ui/Spinner'
import { updateProfile } from 'firebase/auth'
import { clearRoleIntent } from '../auth/roleIntent'
import { signOutCurrentUser } from '../auth/authService'
import { useAuth } from '../auth/useAuth'
import { mapFirebaseAuthError } from '../auth/authErrors'
import { useUserProfile } from './useUserProfile'
import { AppShell } from '../../app/AppShell'
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

  if (status === 'loading' || profileStatus === 'loading' || loading) return <main className="auth-wait"><Spinner label="Loading your profile" /></main>
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

  return (
    <AppShell>
      <main className="profile-page" id="main-content">
        <Card elevated className="profile-card">
          <span className="profile-eyebrow">YOUR ACCOUNT</span>
          <h1>Profile settings</h1>
          <p className="profile-intro">Keep your learning identity up to date.</p>
          {requestError && <Alert tone="error" label="Update not completed">{requestError}</Alert>}
          {notice && <Alert tone="success" label="Saved">{notice}</Alert>}
          <form className="auth-form profile-form" onSubmit={handleSave}>
            <Input label="Display name" name="display-name" autoComplete="name" value={name} onChange={(event) => { setEditedName(event.target.value); setNameError(undefined); setNotice(null) }} error={nameError} disabled={busy} />
            <Input label="Email address" name="email" type="email" value={profile.email ?? user.email ?? ''} readOnly />
            <div className="profile-role"><span>Role</span><strong>{profile.role === 'instructor' ? 'Instructor' : 'Student'}</strong></div>
            <Button type="submit" variant="primary" disabled={busy}><Save size={16} aria-hidden="true" /> {busy ? 'Saving…' : 'Save profile'}</Button>
          </form>
          <Button type="button" variant="secondary" onClick={handleSignOut} disabled={busy}><LogOut size={16} aria-hidden="true" /> Sign out</Button>
        </Card>
      </main>
    </AppShell>
  )
}

function ProfileLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <AppShell><main className="profile-page"><Card elevated className="profile-error-card"><Alert tone="error" label="Profile unavailable">{message}</Alert><Button type="button" onClick={onRetry}>Try again</Button></Card></main></AppShell>
}
