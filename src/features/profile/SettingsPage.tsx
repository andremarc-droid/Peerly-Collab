import { useEffect, useState } from 'react'
import { ArrowLeft, ChevronRight, Trash2, Trophy } from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'
import { Navigate } from 'react-router-dom'
import { AppShell, AppShellLoading } from '../../app/AppShell'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { Input } from '../../shared/ui/Input'
import { PageHeader } from '../../shared/ui/PageHeader'
import { SectionCard } from '../../shared/ui/SectionCard'
import { Switch } from '../../shared/ui/Switch'
import { useToast } from '../../shared/ui/useToast'
import { firestore } from '../../lib/firebase/firestore'
import { useAuth } from '../auth/useAuth'
import { isUnder18DefaultOff, validateScoreboardDisplayName } from '../scoreboard/schemas'
import { callUpdateScoreboardOptIn } from '../scoreboard/services'
import { signedOutRedirectPath } from './accountDeletionState'
import { ProfileLoadError } from './ProfileLoadError'
import { useUserProfile } from './useUserProfile'

/** Profile → Settings. Permanent account actions are listed here and each one opens on its own page. */
export function SettingsPage() {
  const { user, status, profileStatus, profileError, retryProfileSetup } = useAuth()
  const { profile, loading, error } = useUserProfile()
  const { showToast } = useToast()

  const [optIn, setOptIn] = useState<boolean | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [busyOptIn, setBusyOptIn] = useState(false)
  const [busyName, setBusyName] = useState(false)

  const isMinor = profile?.role === 'student' && typeof profile?.age === 'number' && profile.age < 18

  useEffect(() => {
    if (!user) return
    let active = true
    getDoc(doc(firestore, 'users', user.uid)).then((snap) => {
      if (!active) return
      const data = snap.data() || {}
      const savedOptIn = data.scoreboardOptIn as boolean | undefined
      const defaultVal = isUnder18DefaultOff(profile?.role, profile?.age)
      setOptIn(savedOptIn ?? defaultVal)
      setDisplayName((data.scoreboardDisplayName as string) || data.displayName || data.name || '')
    }).catch(() => {
      if (active) setOptIn(isUnder18DefaultOff(profile?.role, profile?.age))
    })
    return () => { active = false }
  }, [user, profile?.role, profile?.age])

  if (status === 'loading' || profileStatus === 'loading' || loading) return <AppShellLoading />
  if (status === 'signedOut' || !user) return <Navigate to={signedOutRedirectPath()} replace />
  if (profileStatus === 'error') return <ProfileLoadError message={profileError ?? 'We couldn’t prepare your profile.'} onRetry={retryProfileSetup} />
  if (error) return <ProfileLoadError message={error} onRetry={retryProfileSetup} />
  if (!profile || !profile.role) return <Navigate to="/role?mode=continue" replace />

  const handleToggleOptIn = async (checked: boolean) => {
    setBusyOptIn(true)
    try {
      await callUpdateScoreboardOptIn(checked, displayName)
      setOptIn(checked)
      showToast('success', checked ? 'You are now visible on the public scoreboard.' : 'You have been removed from the public scoreboard.')
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not update scoreboard privacy.')
    } finally {
      setBusyOptIn(false)
    }
  }

  const handleSaveDisplayName = async () => {
    const check = validateScoreboardDisplayName(displayName)
    if (!check.valid) {
      setNameError(check.error || 'Invalid name')
      return
    }
    setNameError(null)
    setBusyName(true)
    try {
      await callUpdateScoreboardOptIn(optIn ?? true, displayName)
      showToast('success', 'Scoreboard display name updated.')
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not update name.')
    } finally {
      setBusyName(false)
    }
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="PROFILE & ACCOUNT"
        title="Settings"
        subtitle="Manage permanent account settings, scoreboard visibility, and privacy preferences."
        action={<Button to="/profile" variant="secondary"><ArrowLeft size={17} aria-hidden="true" /> Back to profile</Button>}
        mobileAction={null}
      />
      <main className="app-shell__content profile-page" id="main-content">
        <SectionCard
          title="Scoreboard & Privacy"
          description="Control your visibility and display name on the public learning scoreboard."
          icon={<Trophy size={20} />}
          className="profile-access-card profile-settings-card"
        >
          <div className="grid gap-4">
            <Switch
              label="Show me on the public scoreboard"
              hint={isMinor ? 'Students under 18 start hidden by default for safety. You can opt in here.' : 'When enabled, your display name and study points appear on the public scoreboard.'}
              checked={optIn ?? false}
              disabled={busyOptIn || optIn === null}
              onChange={(e) => void handleToggleOptIn(e.target.checked)}
            />

            <Alert tone="info" label="Privacy protection">
              The public scoreboard only reveals your chosen display name, avatar, and study points. Your email, age, role, enrolled classes, and quiz answer details are never displayed. Turning this off removes you from the scoreboard immediately.
            </Alert>

            <div className="grid gap-2 border-t border-navy-900-10 pt-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[200px]">
                  <Input
                    label="Scoreboard display name"
                    name="scoreboard-display-name"
                    value={displayName}
                    onChange={(e) => {
                      setDisplayName(e.target.value)
                      setNameError(null)
                    }}
                    placeholder="e.g. BioExplorer"
                    maxLength={30}
                    error={nameError ?? undefined}
                  />
                </div>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => void handleSaveDisplayName()}
                  disabled={busyName || !displayName.trim()}
                >
                  {busyName ? 'Saving…' : 'Save name'}
                </Button>
              </div>
              <p className="m-0 text-xs text-navy-900-72">
                2 to 30 characters. Profanity and impersonation of system names are not allowed.
              </p>
            </div>
          </div>
        </SectionCard>

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
  )
}

