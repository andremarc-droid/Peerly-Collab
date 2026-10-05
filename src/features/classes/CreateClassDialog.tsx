import { useState, type FormEvent } from 'react'
import { Button } from '../../shared/ui/Button'
import { Dialog } from '../../shared/ui/Dialog'
import { Input } from '../../shared/ui/Input'
import { Switch } from '../../shared/ui/Switch'
import { Textarea } from '../../shared/ui/Textarea'
import { ClassAccentPicker } from './ClassAccentPicker'
import { ClassColorPicker } from './ClassColorPicker'
import type { NewClass } from './types'

const blank: NewClass = { ownerId: '', ownerName: '', name: '', section: '', subject: '', description: '', accent: 'pinstripe', color: 'navy', requireApproval: false, joinEnabled: true }

export function CreateClassDialog({ open, onClose, onCreate, ownerId, ownerName, busy }: {
  open: boolean; onClose: () => void; onCreate: (input: NewClass) => Promise<void>; ownerId: string; ownerName: string; busy: boolean
}) {
  const [form, setForm] = useState(blank)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.name.trim()) { setError('Enter a class name.'); return }
    setError('')
    await onCreate({ ...form, ownerId, ownerName, name: form.name.trim() })
    setForm(blank)
  }

  return <Dialog open={open} onClose={onClose} title="Create a class" description="Set up a class space and share its code with students.">
    <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
      <Input label="Class name" name="class-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} error={error} required maxLength={100} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Section" name="class-section" value={form.section} onChange={(event) => setForm({ ...form, section: event.target.value })} />
        <Input label="Subject" name="class-subject" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} />
      </div>
      <Textarea label="Description" name="class-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} />
      <ClassColorPicker
        value={form.color ?? 'navy'}
        onChange={(color) => setForm({ ...form, color })}
        accent={form.accent ?? 'pinstripe'}
        previewName={form.name || 'Preview class'}
        previewSection={[form.section, form.subject].filter(Boolean).join(' · ') || 'Section · Subject'}
      />
      <ClassAccentPicker value={form.accent ?? 'pinstripe'} onChange={(accent) => setForm({ ...form, accent })} />
      <Switch name="require-approval" label="Require my approval to join" checked={form.requireApproval} onChange={(event) => setForm({ ...form, requireApproval: event.target.checked })} />
      <Switch name="joining-open" label="Joining open" checked={form.joinEnabled} onChange={(event) => setForm({ ...form, joinEnabled: event.target.checked })} />
      <div className="dialog__actions"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create class'}</Button></div>
    </form>
  </Dialog>
}
