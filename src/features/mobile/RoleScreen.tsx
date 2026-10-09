import { Check } from 'lucide-react'
import { Alert } from '../../shared/ui/Alert'
import { M3Button } from '../../shared/ui/m3/M3Button'
import type { RoleIntentMode } from '../auth/roleIntent'
import type { RoleSelection } from '../auth/useRoleSelection'
import { roleChoices } from '../landing/roleChoices'
import { MobileAuthLayout } from './MobileAuthParts'

const intro: Record<RoleIntentMode, string> = {
  signup: 'Pick one to set up your account.',
  signin: 'Pick the role you signed up with.',
  continue: 'Pick one to keep going.',
}

/** Phone role screen: two selectable cards and a Continue button at the bottom. */
export function RoleScreen({ selection }: { selection: RoleSelection }) {
  const { destinationMode, selectedRole, setSelectedRole, continuing, continueError, optionRefs, handleRadioKeyDown, handleContinue } = selection

  return (
    <MobileAuthLayout title="Are you a student or an instructor?" backTo={destinationMode === 'continue' ? undefined : '/start'}>
      <p className="mb-6 mt-0 text-base leading-6 text-navy-900">{intro[destinationMode]}</p>

      <div role="radiogroup" aria-label="Choose your role" className="grid gap-4">
        {roleChoices.map(({ role, title, description, Icon }, index) => {
          const selected = selectedRole === role
          return (
            <button
              key={role}
              ref={(element) => { optionRefs.current[index] = element }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected || (!selectedRole && index === 0) ? 0 : -1}
              onClick={() => setSelectedRole(role)}
              onKeyDown={(event) => handleRadioKeyDown(event, index)}
              className={`m3-press flex min-h-24 w-full items-center gap-4 rounded-3xl border p-4 text-left ${
                selected ? 'border-navy-900 bg-navy-900 text-white' : 'border-navy-900-30 bg-white text-navy-900'
              }`}
            >
              <span className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${selected ? 'bg-white text-navy-900' : 'bg-navy-900 text-white'}`}>
                <Icon size={24} aria-hidden="true" />
              </span>
              <span className="grid min-w-0 flex-1">
                <strong className="font-heading text-xl font-semibold leading-7">{title}</strong>
                <span className="text-base leading-6">{description}</span>
              </span>
              {/* The ring is the radio's own edge, so it uses the 3:1 outline color rather than the soft card border. */}
              <span
                aria-hidden="true"
                className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-white bg-white text-navy-900' : 'border-navy-800-72 bg-white'}`}
              >
                {selected && <Check size={16} strokeWidth={3} />}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-auto grid gap-4 pt-8">
        {continueError && <Alert tone="error" label="Role not saved">{continueError}</Alert>}
        <M3Button disabled={!selectedRole || continuing} onClick={() => void handleContinue()} className="w-full">
          {continuing ? 'Saving…' : 'Continue'}
        </M3Button>
      </div>
    </MobileAuthLayout>
  )
}
