import { useEffect, useRef } from 'react'
import { dashboardPath } from '../../app/returnTo'
import { M3Button } from '../../shared/ui/m3/M3Button'
import { Logo } from '../../shared/ui/Logo'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useAuth } from '../auth/useAuth'
import { useUserProfile } from '../profile/useUserProfile'
import { WelcomeIllustration } from './WelcomeIllustration'

/** The phone landing page: one welcome screen. Choosing sign up or sign in happens on the next screen (`/start`). */
export function WelcomeScreen() {
  const { status } = useAuth()
  const { profile, loading } = useUserProfile()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const waitingForAccount = status === 'loading' || (status === 'signedIn' && loading)
  const signedIn = status === 'signedIn'
  const destination = signedIn ? (profile?.role ? dashboardPath(profile.role) : '/role?mode=continue') : '/start'

  // Every phone screen moves focus to its title when it opens, so a screen reader announces the new screen.
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <main
      id="main-content"
      className="m3-enter flex min-h-dvh flex-col bg-white pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-[max(env(safe-area-inset-top),1rem)]"
    >
      <div className="m3-logo-row flex h-14 items-center px-6">
        <Logo light={false} />
      </div>

      <div className="mx-4 my-2 flex min-h-[22rem] flex-1 items-center justify-center overflow-hidden rounded-[28px] bg-navy-700-05 px-6">
        <WelcomeIllustration />
      </div>

      <section className="px-6 pt-6" aria-labelledby="welcome-title">
        <h1
          id="welcome-title"
          ref={titleRef}
          tabIndex={-1}
          className="m3-title m-0 font-heading text-4xl font-bold leading-[1.15] text-navy-900"
        >
          Welcome to Peerly Collab
        </h1>
        <p className="mb-0 mt-3 text-base leading-6 text-navy-900">
          Quizzes that turn practice into progress, for classrooms, study groups and curious minds.
        </p>
      </section>

      <div className="px-6 pt-6">
        {waitingForAccount ? (
          <Skeleton className="h-14 w-full rounded-full" label="Checking your account" />
        ) : (
          <M3Button to={destination} className="w-full">
            {signedIn ? 'Open dashboard' : 'Get started'}
          </M3Button>
        )}
      </div>
    </main>
  )
}
