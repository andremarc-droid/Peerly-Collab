import { GraduationCap, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { M3AppBar } from '../../shared/ui/m3/M3AppBar'
import { M3Button } from '../../shared/ui/m3/M3Button'
import type { UserRole } from '../auth/roleIntent'

interface MobileAuthLayoutProps {
  title: string
  /** Leave out when there is nowhere to go back to. */
  backTo?: string
  children: ReactNode
}

/**
 * Full-screen frame for the phone auth screens: `<main id="main-content">` holding the large app bar (the h1)
 * and a column for the content. The column fills the screen, so a child with `mt-auto` sits at the bottom.
 */
export function MobileAuthLayout({ title, backTo, children }: MobileAuthLayoutProps) {
  return (
    <main
      id="main-content"
      className="m3-enter flex min-h-dvh flex-col bg-white pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-[max(env(safe-area-inset-top),1rem)]"
    >
      <M3AppBar backTo={backTo} title={title} focusTitle />
      <div className="flex min-w-0 flex-1 flex-col px-6">{children}</div>
    </main>
  )
}

/** Shows which account type the form is for. Changing it happens through the Back button. */
export function MobileRoleChip({ role }: { role: UserRole }) {
  const Icon = role === 'student' ? UserRound : GraduationCap
  return (
    <p className="m-0 inline-flex min-h-8 w-fit items-center gap-2 rounded-full bg-navy-700-07 px-4 text-sm font-semibold text-navy-900">
      <Icon size={16} aria-hidden="true" />
      {role === 'student' ? 'Student account' : 'Instructor account'}
    </p>
  )
}

export function MobileGoogleButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <M3Button variant="outlined" onClick={onClick} disabled={disabled} className="w-full">
      <span aria-hidden="true" className="font-heading text-lg font-bold">G</span>
      Continue with Google
    </M3Button>
  )
}

export function MobileDivider() {
  return (
    <p className="m-0 flex items-center gap-3 text-sm text-navy-900">
      <span aria-hidden="true" className="h-px flex-1 bg-navy-900-30" />
      or continue with email
      <span aria-hidden="true" className="h-px flex-1 bg-navy-900-30" />
    </p>
  )
}
