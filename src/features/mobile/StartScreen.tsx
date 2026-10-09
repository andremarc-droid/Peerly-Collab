import { ChevronRight, LogIn, UserRoundPlus, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { M3AppBar } from '../../shared/ui/m3/M3AppBar'

interface StartOption {
  to: string
  title: string
  text: string
  Icon: LucideIcon
  /** Sign in is the main path: it comes first and is filled navy. */
  primary?: boolean
}

// Both go to the role screen, which saves the mode and then opens the matching form.
const options: StartOption[] = [
  { to: '/role?mode=signin', title: 'Sign in', text: 'Welcome back. Pick up where you left off.', Icon: LogIn, primary: true },
  { to: '/role?mode=signup', title: 'Create account', text: 'New here? Set up your profile in a minute.', Icon: UserRoundPlus },
]

/** Second phone screen: sign up or sign in. The role picker and the form come after it. */
export function StartScreen() {
  return (
    <main
      id="main-content"
      className="m3-enter flex min-h-dvh flex-col bg-white pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-[env(safe-area-inset-top)]"
    >
      <M3AppBar backTo="/" title="Sign in or create an account" focusTitle />
      <div className="px-6">
        <p className="mb-6 mt-0 text-base leading-6 text-navy-900">Next, you’ll tell us if you’re a student or an instructor.</p>
        <ul className="m-0 grid list-none gap-4 p-0">
          {options.map(({ to, title, text, Icon, primary }) => (
            <li key={to}>
              <Link
                to={to}
                className={`m3-press flex min-h-24 items-center gap-4 rounded-3xl border p-4 ${
                  primary ? 'border-navy-900 bg-navy-900 text-white' : 'border-navy-900-30 bg-white text-navy-900'
                }`}
              >
                <span
                  className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${
                    primary ? 'bg-white text-navy-900' : 'bg-navy-900 text-white'
                  }`}
                >
                  <Icon size={24} aria-hidden="true" />
                </span>
                <span className="grid min-w-0 flex-1">
                  <strong className="font-heading text-xl font-semibold leading-7">{title}</strong>
                  <span className="text-base leading-6">{text}</span>
                </span>
                <ChevronRight size={24} aria-hidden="true" className="shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
