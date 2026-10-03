import { useState } from 'react'
import { ArrowLeft, CircleCheck, Mail, UserRound } from 'lucide-react'
import { Alert } from '../../shared/ui/Alert'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { Card } from '../../shared/ui/Card'
import { Checkbox } from '../../shared/ui/Checkbox'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { Container } from '../../shared/ui/Container'
import { DataCard } from '../../shared/ui/DataCard'
import { Dialog } from '../../shared/ui/Dialog'
import { DropdownMenu } from '../../shared/ui/DropdownMenu'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Input } from '../../shared/ui/Input'
import { Logo } from '../../shared/ui/Logo'
import { PageHeader } from '../../shared/ui/PageHeader'
import { RadioGroup } from '../../shared/ui/RadioGroup'
import { Reveal } from '../../shared/ui/Reveal'
import { SectionCard } from '../../shared/ui/SectionCard'
import { Select } from '../../shared/ui/Select'
import { SegmentedControl } from '../../shared/ui/SegmentedControl'
import { Skeleton } from '../../shared/ui/Skeleton'
import { Spinner } from '../../shared/ui/Spinner'
import { StatRow, StatTile } from '../../shared/ui/StatTile'
import { StripeBackground } from '../../shared/ui/StripeBackground'
import { Switch } from '../../shared/ui/Switch'
import { Tabs } from '../../shared/ui/Tabs'
import { Textarea } from '../../shared/ui/Textarea'
import { ToastProvider } from '../../shared/ui/ToastProvider'
import { useToast } from '../../shared/ui/useToast'
import { Tooltip } from '../../shared/ui/Tooltip'
import { Toolbar } from '../../shared/ui/Toolbar'

const samples = [
  { title: 'Retrieval practice', meta: '12 questions · Edited today', type: 'Quiz' },
  { title: 'Cell biology flashcards', meta: '24 cards · Edited yesterday', type: 'Flashcards' },
  { title: 'Study group warm-up', meta: '6 questions · Edited Monday', type: 'Quiz' },
]

export function DesignPage() {
  return <ToastProvider><DesignGallery /></ToastProvider>
}

function DesignGallery() {
  const [query, setQuery] = useState('')
  const [type, setType] = useState('All types')
  const [mode, setMode] = useState('Self-paced')
  const [notify, setNotify] = useState(true)
  const [checked, setChecked] = useState(true)
  const [digest, setDigest] = useState(false)
  const [role, setRole] = useState('student')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { showToast } = useToast()
  const visibleSamples = samples.filter((sample) => sample.title.toLowerCase().includes(query.toLowerCase()) && (type === 'All types' || sample.type === type))

  return (
    <div className="design-page" id="main-content">
      <header className="design-header"><Container><Logo /><Button to="/" variant="ghost"><ArrowLeft size={16} aria-hidden="true" /> Back to site</Button></Container></header>
      <PageHeader eyebrow="DEVELOPER PREVIEW" title="Peerly Collab design system" subtitle="A working gallery of shared components, responsive layouts, and accessible interaction states." />
      <main className="app-shell__content design-gallery">
        <SectionCard title="Page layout and empty states" description="Page headers pair a navy introduction band with a white content panel. Empty states explain what belongs here and only offer useful actions.">
          <div className="design-gallery__grid">
            <EmptyState title="Nothing to review yet" description="When learners submit a quiz, their responses will appear here." action={<Button onClick={() => showToast('info', 'This preview action is connected.')}>Show sample notice</Button>} />
            <EmptyState title="A true empty state" description="There is no hidden link or decorative action in this version." />
          </div>
        </SectionCard>

        <SectionCard title="Stats, section cards and content lists" description="Use concise stats for honest counts, section cards for related controls, and data cards for list rows.">
          <StatRow><StatTile label="Quizzes" value="0" hint="No quizzes created yet" /><StatTile label="Learners" value="0" hint="Appears when learners join" /><StatTile label="Responses" value="0" hint="No submissions yet" /><StatTile label="Study groups" value="0" hint="Available for shared practice" /></StatRow>
          <div className="design-gallery__stack">
            <Toolbar query={query} onQueryChange={setQuery} placeholder="Search sample content" filters={<Select label="Type" name="sample-type" value={type} onChange={(event) => setType(event.target.value)} options={[{ label: 'All types', value: 'All types' }, { label: 'Quiz', value: 'Quiz' }, { label: 'Flashcards', value: 'Flashcards' }]} />} />
            {visibleSamples.length ? visibleSamples.map((sample) => <DataCard key={sample.title} title={sample.title} meta={sample.meta} badge={<Badge>{sample.type}</Badge>} actions={<Button variant="secondary" onClick={() => showToast('info', `${sample.title} is a preview item.`)}>Preview</Button>} />) : <p role="status">No preview items match this search.</p>}
          </div>
        </SectionCard>

        <SectionCard title="Buttons, badges, cards and alerts" description="Buttons maintain 44px touch targets and clear interactive states.">
          <div className="design-gallery__group"><h3>Button variants</h3><div className="design-gallery__row"><Button onClick={() => showToast('success', 'Primary action selected.')}>Primary action</Button><Button variant="secondary" onClick={() => showToast('info', 'Secondary button selected.')}>Secondary action</Button><Button variant="ghost" onClick={() => showToast('info', 'Ghost button selected.')}>Ghost action</Button><Button variant="inverse" onClick={() => showToast('info', 'Inverse button selected.')}>Inverse action</Button><Button disabled>Disabled state</Button><Button to="/" variant="secondary">Link action</Button><Badge>Practice mode</Badge></div></div>
          <div className="design-gallery__grid">
            <Card><span className="eyebrow">DEFAULT CARD</span><h3>A calm place for content</h3><p>Use a simple border for supporting content.</p></Card>
            <Card elevated><span className="eyebrow">ELEVATED CARD</span><h3>More emphasis</h3><p>Navy-tinted shadows lift important surfaces.</p></Card>
          </div>
          <div className="design-gallery__group"><h3>Feedback states</h3><div className="design-gallery__grid"><Alert tone="success" label="Correct">This answer is right.</Alert><Alert tone="warning" label="Review">Try the explanation again.</Alert><Alert tone="error" label="Not quite">This answer needs another look.</Alert></div></div>
        </SectionCard>

        <SectionCard title="Form controls" description="Labels, hints, and errors stay associated with their controls.">
          <div className="design-gallery__grid">
            <div className="design-gallery__stack">
              <Input label="Email address" name="preview-email" type="email" placeholder="you@example.com" leadingIcon={<Mail size={17} />} hint="A hint sits close to the field." />
              <Input label="Name with validation" name="preview-name" defaultValue="" leadingIcon={<UserRound size={17} />} error="Enter your name to continue." />
              <Input label="Disabled input" name="preview-disabled" value="Cannot edit this" disabled readOnly />
              <Textarea label="Short description" name="preview-description" placeholder="A few words about this quiz" hint="Keep it clear and concise." />
              <Textarea label="Description with validation" name="preview-description-error" defaultValue="" error="Add a short description." />
              <Textarea label="Disabled description" name="preview-description-disabled" value="This content is read only." disabled readOnly />
              <Select label="Question type" name="preview-select" options={[{ label: 'Multiple choice', value: 'multiple-choice' }, { label: 'Flashcards', value: 'flashcards' }]} hint="Choose a format." />
              <Select label="Question type with validation" name="preview-select-error" options={[{ label: 'Choose a type', value: '' }, { label: 'Multiple choice', value: 'multiple-choice' }]} error="Choose a question type." />
              <Select label="Disabled selection" name="preview-select-disabled" disabled options={[{ label: 'Unavailable', value: 'unavailable' }]} />
            </div>
            <div className="design-gallery__stack">
              <Switch label="Email reminders" hint="A visual on/off state." checked={notify} onChange={(event) => setNotify(event.target.checked)} />
              <Switch label="Class announcements" hint="This preference is unavailable." checked={false} disabled onChange={() => undefined} />
              <Checkbox label="Save this preference" hint="Keep the selection visible." checked={checked} onChange={(event) => setChecked(event.target.checked)} />
              <Checkbox label="Include weekly digest" checked={digest} onChange={(event) => setDigest(event.target.checked)} />
              <RadioGroup label="Account role" name="preview-role" value={role} onChange={setRole} options={[{ label: 'Student', value: 'student', hint: 'Practice and learn.' }, { label: 'Instructor', value: 'instructor', hint: 'Create and share quizzes.' }]} />
              <SegmentedControl label="Pacing preview" value={mode} onChange={setMode} options={[{ label: 'Self-paced', value: 'Self-paced' }, { label: 'Timed', value: 'Timed' }, { label: 'Group', value: 'Group' }]} />
              <Tabs label="Preview details" tabs={[{ label: 'Overview', content: 'A concise overview panel.' }, { label: 'Settings', content: 'Settings belong in a separate tab.' }, { label: 'Sharing', content: 'Sharing options are grouped here.' }]} />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Menus, dialogs, toasts and tooltips" description="All controls can be reached by keyboard and announce their purpose to assistive technology.">
          <div className="design-gallery__row">
            <DropdownMenu label="Preview menu" trigger={<><span className="account-avatar account-avatar--initial" aria-hidden="true">C</span><span>Component menu</span></>}>
              <div className="account-menu__details"><strong>Design preview</strong><span>hello@peerly-collab.example</span><Badge>Developer</Badge></div>
              <button type="button" role="menuitem" onClick={() => showToast('info', 'Menu item selected.')}>Open sample</button>
            </DropdownMenu>
            <Button variant="secondary" onClick={() => setDialogOpen(true)}>Open dialog</Button>
            <Button variant="secondary" onClick={() => setConfirmOpen(true)}>Open confirm dialog</Button>
            <Button onClick={() => showToast('success', 'This toast dismisses automatically.')}>Success toast</Button>
            <Button variant="secondary" onClick={() => showToast('error', 'The action could not be completed.')}>Error toast</Button>
            <Button variant="ghost" onClick={() => showToast('info', 'Here is a short helpful message.')}>Info toast</Button>
            <Tooltip label="A tooltip adds short supplementary context."><CircleCheck size={18} aria-hidden="true" /></Tooltip>
          </div>
          <div className="design-gallery__sample"><span className="section-kicker">LOADING STATES</span><div className="design-gallery__row"><span className="design-load"><Spinner label="Loading sample" />Loading</span><Skeleton className="skeleton--sample" label="Loading sample card" /></div></div>
          <div className="design-gallery__sample design-gallery__dark"><StripeBackground variant="pinstripe" /><strong>Decorative white pinstripe at reduced opacity</strong></div>
        </SectionCard>

        <SectionCard title="Motion" description="Short transitions support orientation. They are removed when reduced motion is requested.">
          <Reveal><Card><h3>Scroll reveal</h3><p>Cards may fade upward as they enter view, without delaying interaction.</p></Card></Reveal>
        </SectionCard>
      </main>
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="A reusable dialog" description="Use a dialog for a focused decision or short form."><p>Focus is contained here. Press Escape or use the close button to dismiss this panel.</p><div className="dialog__actions"><Button variant="secondary" onClick={() => setDialogOpen(false)}>Close</Button></div></Dialog>
      <ConfirmDialog open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={() => showToast('success', 'Confirmation received.')} title="Confirm an action" description="This demo asks for a typed confirmation before continuing." requiredName="Peerly Collab" confirmLabel="Confirm preview" />
    </div>
  )
}
