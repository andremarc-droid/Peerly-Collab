import { lazy, Suspense, useState } from 'react'
import { ArrowLeft, CircleCheck, Mail, UserRound } from 'lucide-react'
import type { CanvasBoardMode, CanvasCard, CanvasConnection } from '../canvas'

const LazyCanvasBoard = lazy(() => import('../canvas/components/CanvasBoard'))

const sampleRizalCards: CanvasCard[] = [
  {
    id: 'rizal-1',
    type: 'note',
    title: '1. Birth in Calamba (1861)',
    content: 'Born on June 19, 1861 to Francisco Mercado and Teodora Alonso in Calamba, Laguna.',
    position: { x: 40, y: 40 },
  },
  {
    id: 'rizal-2',
    type: 'paragraph',
    title: '2. Education at Ateneo & UST',
    content: 'Completed Bachelor of Arts at Ateneo Municipal, then studied Medicine and Philosophy at UST.',
    position: { x: 260, y: 40 },
  },
  {
    id: 'rizal-3',
    type: 'link',
    title: '3. Noli Me Tangere (1887)',
    content: 'Published in Berlin exposing the social cancer and abuses under colonial rule.',
    url: 'https://nhcp.gov.ph/resources/noli-me-tangere',
    position: { x: 480, y: 40 },
  },
  {
    id: 'rizal-4',
    type: 'paragraph',
    title: '4. El Filibusterismo (1891)',
    content: 'Published in Ghent, Belgium, dedicated to the memory of martyred priests GOMBURZA.',
    position: { x: 700, y: 40 },
  },
  {
    id: 'rizal-5',
    type: 'note',
    title: '5. La Liga Filipina (1892)',
    content: 'Founded on July 3, 1892 in Tondo to unite the archipelago into a peaceful reform society.',
    position: { x: 40, y: 220 },
  },
  {
    id: 'rizal-6',
    type: 'image',
    title: '6. Exile in Dapitan (1892-1896)',
    content: 'Deported to Dapitan where he operated an eye clinic and taught community students.',
    driveFileId: '1RizalDapitanHistoricalArchiveFile',
    driveKind: 'file',
    url: 'https://drive.google.com/file/d/1RizalDapitanHistoricalArchiveFile/view',
    position: { x: 260, y: 220 },
  },
  {
    id: 'rizal-7',
    type: 'note',
    title: '7. Trial at Fort Santiago (1896)',
    content: 'Arrested en route to Cuba and court-martialed for rebellion, sedition, and conspiracy.',
    position: { x: 480, y: 220 },
  },
  {
    id: 'rizal-8',
    type: 'paragraph',
    title: '8. Execution at Bagumbayan',
    content: 'Executed on Dec 30, 1896. His martyrdom and poem Mi Ultimo Adios inspired the revolution.',
    position: { x: 700, y: 220 },
  },
]

const sampleRizalConnections: CanvasConnection[] = [
  { id: 'rizal-1->rizal-2', from: 'rizal-1', to: 'rizal-2' },
  { id: 'rizal-2->rizal-3', from: 'rizal-2', to: 'rizal-3' },
  { id: 'rizal-3->rizal-4', from: 'rizal-3', to: 'rizal-4' },
  { id: 'rizal-4->rizal-5', from: 'rizal-4', to: 'rizal-5' },
  { id: 'rizal-5->rizal-6', from: 'rizal-5', to: 'rizal-6' },
  { id: 'rizal-6->rizal-7', from: 'rizal-6', to: 'rizal-7' },
  { id: 'rizal-7->rizal-8', from: 'rizal-7', to: 'rizal-8' },
]

const sampleReviewStatus: Record<string, 'correct' | 'missed' | 'wrong'> = {
  'rizal-1->rizal-2': 'correct',
  'rizal-2->rizal-3': 'correct',
  'rizal-3->rizal-4': 'correct',
  'rizal-4->rizal-5': 'correct',
  'rizal-5->rizal-6': 'correct',
  'rizal-6->rizal-7': 'missed',
  'rizal-7->rizal-8': 'correct',
  'rizal-1->rizal-8': 'wrong',
}
import { Alert } from '../../shared/ui/Alert'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { Card } from '../../shared/ui/Card'
import { Checkbox } from '../../shared/ui/Checkbox'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { Container } from '../../shared/ui/Container'
import { DataCard } from '../../shared/ui/DataCard'
import { DataTable } from '../../shared/ui/DataTable'
import { Dialog } from '../../shared/ui/Dialog'
import { DropdownMenu } from '../../shared/ui/DropdownMenu'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Input } from '../../shared/ui/Input'
import { Logo } from '../../shared/ui/Logo'
import { PageHeader } from '../../shared/ui/PageHeader'
import { PageSection } from '../../shared/ui/PageSection'
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
import { ClassColorPicker } from '../classes/ClassColorPicker'
import { ClassTile } from '../classes/ClassTile'
import type { ClassColor } from '../classes/types'

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
  const [galleryColor, setGalleryColor] = useState<ClassColor>('ocean')
  const [canvasMode, setCanvasMode] = useState<CanvasBoardMode>('play')
  const [demoCards, setDemoCards] = useState<CanvasCard[]>(sampleRizalCards)
  const [demoConnections, setDemoConnections] = useState<CanvasConnection[]>(sampleRizalConnections)
  const [demoPositions, setDemoPositions] = useState<Record<string, { x: number; y: number }>>({})
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
          <StatRow><StatTile label="Quizzes" value="0" hint="No quizzes created yet" variant="navy" /><StatTile label="Learners" value="0" hint="Appears when learners join" /><StatTile label="Responses" value="0" hint="No submissions yet" /><StatTile label="Study groups" value="0" hint="Available for shared practice" /></StatRow>
          <div className="design-gallery__stack">
            <Toolbar query={query} onQueryChange={setQuery} placeholder="Search sample content" filters={<Select label="Type" name="sample-type" value={type} onChange={(event) => setType(event.target.value)} options={[{ label: 'All types', value: 'All types' }, { label: 'Quiz', value: 'Quiz' }, { label: 'Flashcards', value: 'Flashcards' }]} />} />
            {visibleSamples.length ? visibleSamples.map((sample) => <DataCard key={sample.title} title={sample.title} meta={sample.meta} badge={<Badge>{sample.type}</Badge>} actions={<Button variant="secondary" onClick={() => showToast('info', `${sample.title} is a preview item.`)}>Preview</Button>} />) : <p role="status">No preview items match this search.</p>}
          </div>
        </SectionCard>

        <PageSection title="Responsive data table" description="Sortable headers on wide screens; labelled cards on mobile." action={<Button variant="secondary" onClick={() => showToast('info', 'Table action selected.')}>Export preview</Button>}>
          <DataTable label="Sample learner roster" rows={[{ id: '1', learner: 'Ari Nguyen', status: 'Active', score: 92 }, { id: '2', learner: 'Morgan Lee', status: 'Pending', score: 0 }, { id: '3', learner: 'Sam Rivera', status: 'Active', score: 85 }]} getRowId={(row) => row.id} selectedId="1" columns={[{ key: 'learner', header: 'Learner', cell: (row) => row.learner, sortValue: (row) => row.learner }, { key: 'status', header: 'Status', cell: (row) => row.status, sortValue: (row) => row.status }, { key: 'score', header: 'Average', cell: (row) => `${row.score}%`, sortValue: (row) => row.score }]} />
        </PageSection>

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

        <SectionCard title="Class identity and tiles" description="Google Classroom-style class identity pairing theme color with low-opacity masked stripes.">
          <div className="grid gap-6">
            <ClassColorPicker
              value={galleryColor}
              onChange={setGalleryColor}
              accent="pinstripe"
              previewName="Biology 101"
              previewSection="Period 3 · Genetics"
            />
            <div className="grid gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-navy-800-72">Class tiles grid</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <ClassTile
                  role="instructor"
                  id="preview-inst"
                  name="AP Computer Science"
                  section="Period 2"
                  subject="Algorithms"
                  color={galleryColor}
                  accent="pinstripe"
                  joinCode="8VYRTY"
                  studentsCount={28}
                  quizzesCount={5}
                  pendingCount={2}
                  onCopyCode={() => showToast('success', 'Join code copied.')}
                  onEditAppearance={() => showToast('info', 'Edit appearance clicked.')}
                  onToggleArchive={() => showToast('info', 'Archive toggled.')}
                />
                <ClassTile
                  role="student"
                  id="preview-stu"
                  name="Organic Chemistry"
                  section="Section 4B"
                  subject="Reactions"
                  color="teal"
                  accent="stripeFade"
                  instructorName="Dr. Chen"
                  availableQuizzesCount={3}
                  enrollmentStatus="active"
                  onLeaveClass={() => showToast('info', 'Leave class clicked.')}
                />
                <ClassTile
                  role="student"
                  id="preview-pending"
                  name="World History"
                  section="Period 5"
                  subject="European History"
                  color="amber"
                  accent="solid"
                  instructorName="Mr. Davis"
                  availableQuizzesCount={0}
                  enrollmentStatus="pending"
                />
                <ClassTile
                  role="instructor"
                  id="preview-archived"
                  name="Past Term Physics"
                  section="Fall 2025"
                  subject="Mechanics"
                  color="slate"
                  accent="pinstripe"
                  status="archived"
                  joinCode="ARC123"
                  studentsCount={31}
                  quizzesCount={8}
                  onToggleArchive={() => showToast('info', 'Restore clicked.')}
                />
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Interactive canvas board"
          description="A concept mapping board for individual student practice and instructor authoring. Try all three modes below."
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SegmentedControl
                label="Canvas mode"
                value={canvasMode}
                onChange={(val) => setCanvasMode(val as CanvasBoardMode)}
                options={[
                  { label: 'Play mode (student)', value: 'play' },
                  { label: 'Edit mode (instructor)', value: 'edit' },
                  { label: 'Review mode (feedback)', value: 'review' },
                ]}
              />
              <span className="text-sm text-navy-900-72">
                {canvasMode === 'play' && 'Play: move cards, draw/delete connections, card content is read-only.'}
                {canvasMode === 'edit' && 'Edit: author cards, move, delete connections or cards.'}
                {canvasMode === 'review' && 'Review: read-only feedback graph with status icons and text labels.'}
              </span>
            </div>

            <div className="h-[520px] w-full">
              <Suspense
                fallback={
                  <div className="h-full w-full flex items-center justify-center rounded-2xl border border-navy-900-12 bg-white">
                    <Spinner label="Loading canvas board..." />
                  </div>
                }
              >
                <LazyCanvasBoard
                  cards={demoCards}
                  connections={canvasMode === 'review' ? [...demoConnections, { id: 'rizal-1->rizal-8', from: 'rizal-1', to: 'rizal-8' }] : demoConnections}
                  mode={canvasMode}
                  positions={demoPositions}
                  statusByConnection={canvasMode === 'review' ? sampleReviewStatus : undefined}
                  maxConnections={12}
                  onConnectionsChange={setDemoConnections}
                  onPositionsChange={setDemoPositions}
                  onCardsChange={setDemoCards}
                />
              </Suspense>
            </div>
          </div>
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
