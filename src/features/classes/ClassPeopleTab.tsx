import { Download, Search, ShieldBan, UserCheck, UserMinus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { DataCard } from '../../shared/ui/DataCard'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Input } from '../../shared/ui/Input'
import { useToast } from '../../shared/ui/useToast'
import { approveEnrollment, blockStudent, buildRosterCsv, declineEnrollment, removeStudent, unblockStudent } from './services/enrollmentService'
import type { ClassWithId, EnrollmentStatus, EnrollmentWithId } from './types'

type ConfirmAction = { enrollment: EnrollmentWithId; kind: 'remove' | 'block' } | null

export function ClassPeopleTab({ classroom, enrollments, counts }: { classroom: ClassWithId; enrollments: EnrollmentWithId[]; counts: { students: number; pending: number } }) {
  const { showToast } = useToast()
  const [search, setSearch] = useState('')
  const [busyUid, setBusyUid] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmAction>(null)
  const [approveAllBusy, setApproveAllBusy] = useState(false)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const pending = enrollments.filter((entry) => entry.status === 'pending')
  const active = useMemo(() => enrollments.filter((entry) => entry.status === 'active' && entry.studentName.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [enrollments, search])
  const blocked = enrollments.filter((entry) => entry.status === 'blocked')

  async function run(uid: string, message: string, action: () => Promise<void>) {
    setBusyUid(uid)
    try { await action(); showToast('success', message) }
    catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'The roster could not be updated.') }
    finally { setBusyUid(null) }
  }

  async function approveAll() {
    setApproveAllBusy(true)
    try { await Promise.all(pending.map((entry) => approveEnrollment(classroom.id, entry.uid))); showToast('success', `${pending.length} ${pending.length === 1 ? 'request' : 'requests'} approved.`) }
    catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'Some requests could not be approved.') }
    finally { setApproveAllBusy(false) }
  }

  async function finishConfirm() {
    if (!confirm) return
    setConfirmBusy(true)
    const { enrollment, kind } = confirm
    await run(enrollment.uid, kind === 'remove' ? `${enrollment.studentName} was removed. Past attempts are kept.` : `${enrollment.studentName} was blocked from rejoining.`, () => kind === 'remove' ? removeStudent(classroom.id, enrollment.uid) : blockStudent(classroom.id, enrollment.uid))
    setConfirmBusy(false); setConfirm(null)
  }

  function exportRoster() {
    const csv = buildRosterCsv(enrollments)
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = `${classroom.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}-roster.csv`; link.click()
    URL.revokeObjectURL(url)
    showToast('success', 'Roster CSV downloaded.')
  }

  function renderStudent(entry: EnrollmentWithId, actions: 'pending' | 'active' | 'blocked') {
    const status: EnrollmentStatus = entry.status
    return <DataCard key={entry.id} title={entry.studentName} meta={`Joined ${entry.joinedAt.toDate().toLocaleDateString(undefined, { dateStyle: 'medium' })}`} badge={<Badge>{status === 'pending' ? 'Pending' : status === 'blocked' ? 'Blocked' : 'Active'}</Badge>}>
      {actions === 'pending' ? <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={busyUid === entry.uid} onClick={() => void run(entry.uid, `${entry.studentName} approved.`, () => approveEnrollment(classroom.id, entry.uid))}><UserCheck size={15} aria-hidden="true" /> Approve</Button><Button type="button" variant="secondary" disabled={busyUid === entry.uid} onClick={() => void run(entry.uid, 'Join request declined.', () => declineEnrollment(classroom.id, entry.uid))}><UserMinus size={15} aria-hidden="true" /> Decline</Button></div>
        : actions === 'active' ? <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={busyUid === entry.uid} onClick={() => setConfirm({ enrollment: entry, kind: 'remove' })}><UserMinus size={15} aria-hidden="true" /> Remove</Button><Button type="button" variant="secondary" disabled={busyUid === entry.uid} onClick={() => setConfirm({ enrollment: entry, kind: 'block' })}><ShieldBan size={15} aria-hidden="true" /> Block</Button></div>
          : <Button type="button" variant="secondary" disabled={busyUid === entry.uid} onClick={() => void run(entry.uid, `${entry.studentName} can request to join again.`, () => unblockStudent(classroom.id, entry.uid))}><UserCheck size={15} aria-hidden="true" /> Unblock</Button>}
    </DataCard>
  }

  return <div className="grid gap-8">
    <section className="grid gap-4" aria-labelledby="people-heading">
      <header className="flex flex-wrap items-end justify-between gap-3"><div><span className="section-kicker">CLASS ROSTER</span><h2 id="people-heading" className="m-0 text-2xl">People</h2><p className="mb-0 text-sm text-navy-800-72">{counts.students} active students · {counts.pending} pending</p></div><Button type="button" variant="secondary" onClick={exportRoster} disabled={!enrollments.length}><Download size={16} aria-hidden="true" /> Export roster (CSV)</Button></header>
      {classroom.requireApproval && <div className="grid gap-3"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="m-0 text-lg">Pending requests <Badge>{pending.length}</Badge></h3>{pending.length > 1 && <Button type="button" variant="secondary" disabled={approveAllBusy} onClick={() => void approveAll()}>{approveAllBusy ? 'Approving…' : 'Approve all'}</Button>}</div>{pending.length ? pending.map((entry) => renderStudent(entry, 'pending')) : <p className="m-0 text-sm text-navy-800-72">No requests are waiting for approval.</p>}</div>}
      <div className="grid gap-3"><Input label="Search students" name="student-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name" leadingIcon={<Search size={17} />} />
        {active.length ? active.map((entry) => renderStudent(entry, 'active')) : <EmptyState title={search ? 'No students match that search' : 'Invite students to join'} description={search ? 'Try a different name.' : 'Share the class code or invite link. Students will appear here after joining.'} />}
      </div>
    </section>
    <section className="grid gap-3" aria-labelledby="blocked-heading"><h3 id="blocked-heading" className="m-0 text-lg">Blocked students <Badge>{blocked.length}</Badge></h3>{blocked.length ? blocked.map((entry) => renderStudent(entry, 'blocked')) : <p className="m-0 text-sm text-navy-800-72">No students are blocked from this class.</p>}</section>
    <ConfirmDialog open={Boolean(confirm)} onClose={() => setConfirm(null)} onConfirm={() => void finishConfirm()} title={confirm?.kind === 'block' ? 'Block this student?' : 'Remove this student?'} description={confirm?.kind === 'block' ? `${confirm.enrollment.studentName} will not be able to rejoin this class while blocked. Past attempts will be kept.` : `${confirm?.enrollment.studentName} will be removed from the roster. Their past quiz attempts are kept.`} confirmLabel={confirm?.kind === 'block' ? 'Block student' : 'Remove student'} busy={confirmBusy} closeOnConfirm={false} />
    {confirmBusy && <span className="sr-only" role="status">Updating enrollment…</span>}
  </div>
}
