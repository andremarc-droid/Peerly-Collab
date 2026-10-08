import { LogIn, UserCheck, UserPlus } from 'lucide-react'
import type { RoleIntentMode } from './roleIntent'

const modeContent: Record<RoleIntentMode, { label: string; Icon: typeof UserPlus }> = {
  signup: { label: 'Sign up', Icon: UserPlus },
  signin: { label: 'Sign in', Icon: LogIn },
  continue: { label: 'Continue', Icon: UserCheck },
}

interface AuthModeBadgeProps {
  mode: RoleIntentMode
  /** Optional sub-step name, e.g. "Password reset". */
  detail?: string
  step?: number
  totalSteps?: number
}

function formatStep(value: number): string {
  return String(value).padStart(2, '0')
}

export function AuthModeBadge({ mode, detail, step, totalSteps }: AuthModeBadgeProps) {
  const { label, Icon } = modeContent[mode]
  const showStep = step !== undefined && totalSteps !== undefined
  return (
    <div className="auth-mode" data-mode={mode}>
      <span className="auth-mode__pill">
        <Icon size={15} aria-hidden="true" />
        {detail ? `${label} · ${detail}` : label}
      </span>
      {showStep && (
        <span className="auth-mode__step" aria-label={`Step ${step} of ${totalSteps}`}>
          {formatStep(step)} / {formatStep(totalSteps)}
        </span>
      )}
    </div>
  )
}
