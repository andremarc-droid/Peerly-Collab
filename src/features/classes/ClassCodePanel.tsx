import { useState } from 'react'
import { Copy, RefreshCw, Share2, SquareArrowOutUpRight } from 'lucide-react'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { Dialog } from '../../shared/ui/Dialog'
import { Switch } from '../../shared/ui/Switch'
import { useToast } from '../../shared/ui/useToast'
import { copyText, inviteUrl } from './classUtilities'
import type { ClassWithId } from './types'

export function ClassCodePanel({ classroom, onJoiningChange, onRegenerate, busy, shareOnOpen = false }: {
  classroom: ClassWithId; onJoiningChange: (open: boolean) => void; onRegenerate: () => Promise<void>; busy: boolean; shareOnOpen?: boolean
}) {
  const { showToast } = useToast()
  const [share, setShare] = useState(shareOnOpen)
  const [projector, setProjector] = useState(false)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const invite = inviteUrl(window.location.origin, classroom.joinCode)

  async function copy(value: string, success: string) {
    try { await copyText(value); showToast('success', success) }
    catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'Could not copy to clipboard.') }
  }

  return <>
    <section className="class-code-panel grid gap-4 rounded-3xl p-5 shadow-md sm:p-7" aria-label="Class join code">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><span className="section-kicker">STUDENT INVITATION</span><p className="m-0 font-mono text-3xl font-bold tracking-[0.22em] sm:text-4xl">{classroom.joinCode}</p></div><Button type="button" onClick={() => setProjector(true)}><Share2 size={16} aria-hidden="true" /> Show to class</Button></div>
      <Switch label={classroom.joinEnabled ? 'Joining open' : 'Joining paused'} hint={classroom.status === 'archived' ? 'Restore this class before students can join.' : 'Pause new sign-ups without removing current students.'} checked={classroom.joinEnabled} onChange={(event) => onJoiningChange(event.target.checked)} disabled={busy || classroom.status === 'archived'} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => void copy(classroom.joinCode, 'Join code copied.')}><Copy size={16} aria-hidden="true" /> Copy code</Button>
        <Button type="button" variant="secondary" onClick={() => void copy(invite, 'Invite link copied.')}><SquareArrowOutUpRight size={16} aria-hidden="true" /> Copy invite link</Button>
        <Button type="button" variant="secondary" onClick={() => setShare(true)}><Share2 size={16} aria-hidden="true" /> Share invite</Button>
        <Button type="button" variant="secondary" onClick={() => setConfirmRegenerate(true)} disabled={busy}><RefreshCw size={16} aria-hidden="true" /> Regenerate code</Button>
      </div>
    </section>
    <Dialog open={share} onClose={() => setShare(false)} title="Share this code" description="Students can enter this code after signing in to join your class.">
      <div className="grid justify-items-center gap-4 rounded-2xl bg-navy-900 p-6 text-center text-white">
        <span className="text-sm text-white-72">Class join code</span><strong className="font-mono text-4xl tracking-[0.24em]">{classroom.joinCode}</strong>
        <Button type="button" variant="inverse" onClick={() => void copy(classroom.joinCode, 'Join code copied.')}><Copy size={16} aria-hidden="true" /> Copy code</Button>
      </div>
      {(classroom.status === 'archived' || !classroom.joinEnabled) && <Alert tone="warning" label={classroom.status === 'archived' ? 'Class archived' : 'Joining is paused'}>{classroom.status === 'archived' ? 'Restore this class before students can join.' : 'Turn on joining in the class settings before students use this code.'}</Alert>}
      <p className="break-all text-sm text-navy-800-72">Invite link: {invite}</p>
      <div className="dialog__actions"><Button type="button" variant="secondary" onClick={() => setShare(false)}>Done</Button></div>
    </Dialog>
    <Dialog open={projector} onClose={() => setProjector(false)} title={`Join ${classroom.name}`} description="Share this code with your students." className="!fixed !inset-0 !m-0 !flex !h-screen !w-screen !max-w-none !flex-col !justify-center !rounded-none !p-0">
      <div className="relative grid min-h-[65vh] place-content-center justify-items-center gap-8 overflow-hidden bg-navy-900 px-5 py-16 text-center text-white">
        <div aria-hidden="true" className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0,transparent_27px,var(--color-white-12)_28px,var(--color-white-12)_29px)] [mask-image:linear-gradient(180deg,transparent,white_25%,white_75%,transparent)]" />
        <p className="relative m-0 text-lg text-white-72">Join {classroom.name}{classroom.section ? ` · ${classroom.section}` : ''}</p>
        <strong className="relative font-mono text-[clamp(4rem,18vw,13rem)] font-bold leading-none tracking-[0.2em]">{classroom.joinCode}</strong>
        <Button type="button" variant="inverse" className="relative" onClick={() => setProjector(false)}>Close projector</Button>
      </div>
    </Dialog>
    <ConfirmDialog open={confirmRegenerate} onClose={() => setConfirmRegenerate(false)} onConfirm={() => void onRegenerate()} title="Regenerate class code?" description="The current code will stop working immediately. Students with the old code will need the new one to join." confirmLabel="Regenerate code" />
  </>
}
