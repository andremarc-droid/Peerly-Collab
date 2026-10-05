import { Archive, Save, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { Input } from '../../shared/ui/Input'
import { SectionCard } from '../../shared/ui/SectionCard'
import { Switch } from '../../shared/ui/Switch'
import { Textarea } from '../../shared/ui/Textarea'
import { useToast } from '../../shared/ui/useToast'
import { archiveClass, deleteClassCascade, restoreClass, setJoinEnabled, setRequireApproval, updateClass } from './services'
import { ClassAccentPicker } from './ClassAccentPicker'
import { ClassColorPicker } from './ClassColorPicker'
import type { ClassAccent, ClassColor, ClassWithId } from './types'

export function ClassSettingsTab({ classroom, counts }: { classroom: ClassWithId; counts: { students: number; quizzes: number } }) {
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [form, setForm] = useState<{
    name: string
    section: string
    subject: string
    description: string
    accent: ClassAccent
    color: ClassColor
  }>({
    name: classroom.name,
    section: classroom.section,
    subject: classroom.subject,
    description: classroom.description,
    accent: classroom.accent,
    color: classroom.color ?? 'navy',
  })
  const [joinEnabled, setJoin] = useState(classroom.joinEnabled)
  const [requireApproval, setApproval] = useState(classroom.requireApproval)
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [error, setError] = useState('')

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.name.trim()) { setError('Enter a class name.'); return }
    setSaving(true); setError('')
    try { await updateClass(classroom.id, { ...form, name: form.name.trim() }); showToast('success', 'Class details saved.') }
    catch (reason) { const message = reason instanceof Error ? reason.message : 'Class details could not be saved.'; setError(message); showToast('error', message) }
    finally { setSaving(false) }
  }

  async function toggleJoin(value: boolean) {
    setJoin(value)
    try { await setJoinEnabled(classroom.id, value); showToast('success', value ? 'Joining is open.' : 'Joining is paused.') }
    catch (reason) { setJoin(!value); showToast('error', reason instanceof Error ? reason.message : 'Joining setting could not be updated.') }
  }
  async function toggleApproval(value: boolean) {
    setApproval(value)
    try { await setRequireApproval(classroom.id, value); showToast('success', value ? 'New students now need approval.' : 'Students can join without approval.') }
    catch (reason) { setApproval(!value); showToast('error', reason instanceof Error ? reason.message : 'Approval setting could not be updated.') }
  }
  async function archive() {
    setMutating(true)
    try { await (classroom.status === 'active' ? archiveClass(classroom.id) : restoreClass(classroom.id)); showToast('success', classroom.status === 'active' ? 'Class archived.' : 'Class restored.') }
    catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'Class status could not be updated.') }
    finally { setMutating(false) }
  }
  async function remove() {
    setMutating(true)
    try { await deleteClassCascade(classroom.id); showToast('success', 'Class, enrollments, quizzes, and submissions were deleted.'); navigate('/instructor') }
    catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'Class could not be deleted.') }
    finally { setMutating(false); setDeleteOpen(false) }
  }

  return <div className="grid gap-6">
    <form className="grid gap-5" onSubmit={(event) => void save(event)}>
      <SectionCard title="Class details" description="Keep the class information clear for your learners.">
        {error && <Alert tone="error" label="Could not save class">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2"><Input label="Class name" name="settings-class-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /><Input label="Section" name="settings-class-section" value={form.section} onChange={(event) => setForm({ ...form, section: event.target.value })} /><Input label="Subject" name="settings-class-subject" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} /><Textarea label="Description" name="settings-class-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={4} className="sm:col-span-2" /></div>
        <ClassColorPicker
          value={form.color}
          onChange={(color) => setForm({ ...form, color })}
          accent={form.accent}
          previewName={form.name || classroom.name}
          previewSection={[form.section, form.subject].filter(Boolean).join(' · ') || 'Section · Subject'}
        />
        <ClassAccentPicker value={form.accent} onChange={(accent) => setForm({ ...form, accent })} />
        <Button type="submit" disabled={saving}><Save size={16} aria-hidden="true" /> {saving ? 'Saving…' : 'Save details'}</Button>
      </SectionCard>
      <SectionCard title="Joining and approval" description="Control how new students enter this class."><Switch label="Joining open" hint={classroom.status === 'archived' ? 'Restore the class before opening joining.' : 'When paused, new students cannot use the class code.'} checked={joinEnabled} onChange={(event) => void toggleJoin(event.target.checked)} disabled={classroom.status === 'archived'} /><Switch label="Require my approval to join" hint="Requests wait in Pending until you approve them." checked={requireApproval} onChange={(event) => void toggleApproval(event.target.checked)} disabled={classroom.status === 'archived'} /></SectionCard>
    </form>
    <SectionCard title="Class status" description={classroom.status === 'active' ? 'Archiving pauses access through this class.' : 'Restoring makes this class active again.'}><Button type="button" variant="secondary" disabled={mutating} onClick={() => void archive()}><Archive size={16} aria-hidden="true" /> {classroom.status === 'active' ? 'Archive class' : 'Restore class'}</Button></SectionCard>
    <SectionCard title="Danger zone · Delete class" description="Archive is gentler when you may need this class again." className="danger-zone"><p className="m-0">Deleting will erase {counts.students} active student enrollments and {counts.quizzes} quizzes, including their submissions and answer keys.</p><Button type="button" className="button--destructive" onClick={() => setDeleteOpen(true)}><Trash2 size={16} aria-hidden="true" /> Delete class</Button></SectionCard>
    <ConfirmDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={() => void remove()} title="Delete this class?" description={`This permanently removes ${counts.students} student enrollments and ${counts.quizzes} quizzes with their submissions. Archive “${classroom.name}” instead if you may need it later.`} requiredName={classroom.name} confirmLabel="Delete class" busy={mutating} closeOnConfirm={false} />
  </div>
}
