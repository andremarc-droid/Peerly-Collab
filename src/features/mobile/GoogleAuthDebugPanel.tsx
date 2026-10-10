import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Bug, Clipboard, Trash2 } from 'lucide-react'
import { firebaseConfig } from '../../lib/firebase/config'
import { googleAuthDiagnosticEventName, type GoogleAuthDiagnostic } from '../auth/googleAuthDiagnostics'

export function GoogleAuthDebugPanel() {
  const [entries, setEntries] = useState<GoogleAuthDiagnostic[]>([])
  const [copyStatus, setCopyStatus] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined
    const handleDiagnostic = (event: Event) => {
      const diagnostic = (event as CustomEvent<GoogleAuthDiagnostic>).detail
      setEntries((current) => [...current, diagnostic].slice(-20))
      setOpen(true)
    }
    const name = googleAuthDiagnosticEventName()
    window.addEventListener(name, handleDiagnostic)
    return () => window.removeEventListener(name, handleDiagnostic)
  }, [])

  if (!Capacitor.isNativePlatform()) return null

  const report = [
    `Platform: ${Capacitor.getPlatform()} (native)`,
    `Firebase project ID: ${firebaseConfig.projectId || 'missing'}`,
    `Firebase auth domain: ${firebaseConfig.authDomain || 'missing'}`,
    'Credential and token values are intentionally omitted.',
    ...entries.map(({ time, step, status, code, message }) =>
      `${time} [${status}] ${step}${code ? ` — ${code}` : ''}${message ? ` — ${message}` : ''}`),
  ].join('\n')

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report)
      setCopyStatus('Diagnostics copied. Paste them into your support message.')
    } catch {
      setCopyStatus('Could not copy automatically. Select and copy the diagnostic text below.')
    }
  }

  return (
    <section className="grid gap-3 rounded-2xl border border-navy-900-30 bg-white p-4 text-navy-900" aria-label="Google sign-in diagnostics">
      <div className="flex items-center justify-between gap-3">
        <button type="button" className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left font-semibold" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <Bug size={18} aria-hidden="true" />
          <span>Google sign-in diagnostics</span>
        </button>
        <button type="button" className="grid size-11 shrink-0 place-items-center rounded-full border border-navy-900-30" aria-label="Clear diagnostics" onClick={() => setEntries([])}>
          <Trash2 size={17} aria-hidden="true" />
        </button>
      </div>
      {open && (
        <>
          <p className="m-0 text-sm">Platform: {Capacitor.getPlatform()} · Firebase project: {firebaseConfig.projectId || 'missing'}</p>
          <p className="m-0 text-sm">The panel records sign-in steps, error codes, and messages. Credential and token values are omitted.</p>
          {entries.length > 0 ? (
            <ol className="m-0 grid max-h-64 gap-2 overflow-auto rounded-xl bg-navy-700-05 p-3 text-sm" aria-live="polite">
              {entries.map((entry, index) => (
                <li key={`${entry.time}-${index}`} className="break-words">
                  <strong>{entry.status.toUpperCase()} · {entry.step}</strong>
                  {entry.code && <span> · Code: {entry.code}</span>}
                  {entry.message && <p className="m-0 mt-1">{entry.message}</p>}
                  <time className="block text-sm" dateTime={entry.time}>{new Date(entry.time).toLocaleTimeString()}</time>
                </li>
              ))}
            </ol>
          ) : <p className="m-0 text-sm">No sign-in attempt recorded yet. Keep this panel open, then tap Continue with Google.</p>}
          <button type="button" className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full border border-navy-900-30 px-4 text-sm font-semibold" onClick={() => void copyReport()}>
            <Clipboard size={16} aria-hidden="true" /> Copy diagnostics
          </button>
          {copyStatus && <p className="m-0 text-sm" role="status">{copyStatus}</p>}
        </>
      )}
    </section>
  )
}
