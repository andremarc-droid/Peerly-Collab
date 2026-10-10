import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Layout, Plus, StickyNote } from 'lucide-react'
import { AppShell } from '../../app/AppShell'
import { PageHeader } from '../../shared/ui/PageHeader'
import { Tabs } from '../../shared/ui/Tabs'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Alert } from '../../shared/ui/Alert'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useAuth } from '../auth/useAuth'
import { useToast } from '../../shared/ui/useToast'
import { ChatbotTab, TutorDock } from '../chatbot'
import { FlashcardsTab, useFlashcardDecks } from '../flashcards'
import { FlashcardStudyDialog } from '../flashcards/components/FlashcardStudyDialog'
import type { FlashcardDeckWithId } from '../flashcards/types'
import { NotesTabContent } from './components/NotesTabContent'
import { CreateLearningCanvasDialog } from './components/CreateLearningCanvasDialog'
import { SharedCanvasList } from './collab/SharedCanvasList'
import { useSharedCanvases } from './collab/useSharedCanvases'
import { watchMyCanvasesAcrossClasses, createCanvas, deleteCanvas } from './services'
import type { LearningCanvasWithId } from './types'
import { NOTE_CONTENT_MAX, NOTE_NODE_ID, noteDescription } from './noteContent'
import { LearningInviteCodeInput } from '../learningSharing/LearningInviteCodeInput'
import { aggregateLearningLibrary, resolveLearningTab, type LearningTab } from './library'
import { watchDeckProgress } from '../studyEngine/services'
import { countStudyLoad, deckProgressKey, type StudyDeck } from '../studyEngine/queue'
import type { DeckProgress } from '../studyEngine/progress'
import { listLessonPlans, loadLessonProgress } from '../lessons/services'
import { nextLessonToResume } from '../lessons/progress'
import type { LessonPlan } from '../lessons/types'
import { StatsHome } from '../stats/StatsHome'

const tabNames = ['home', 'decks', 'lessons', 'notes', 'canvases', 'groups'] as const
const CreateLearningFlow = lazy(() => import('../flashcards/create/CreateLearningFlow').then(module => ({ default: module.CreateLearningFlow })))
const LessonsTab = lazy(() => import('../lessons/LessonsTab').then(module => ({ default: module.LessonsTab })))
const GroupsTab = lazy(() => import('../groups/GroupsTab').then(module => ({ default: module.GroupsTab })))
const labels: Record<LearningTab, string> = { home: 'Home', decks: 'Decks', lessons: 'Lessons', notes: 'Notes', canvases: 'Canvases', groups: 'Groups' }

export function LearningHubPage() {
  const { user, profile } = useAuth()
  const role = profile?.role === 'instructor' ? 'instructor' : 'student'
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const activeTab = resolveLearningTab(params.get('tab'))
  const [canvases, setCanvases] = useState<LearningCanvasWithId[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createDeckOpen, setCreateDeckOpen] = useState(false)
  const [studyTarget, setStudyTarget] = useState<{ deck: FlashcardDeckWithId; mode: 'flashcards' | 'quiz' | 'test' } | null>(null)
  const [progressByKey, setProgressByKey] = useState<Record<string, DeckProgress>>({})
  const [lessonRecent, setLessonRecent] = useState<{ type: 'lesson'; title: string; date: LessonPlan['updatedAt']; href: string } | null>(null)
  const shared = useSharedCanvases(user?.uid)
  const workspaceId = user?.uid ?? ''
  const { decks, error: deckError } = useFlashcardDecks({ role: 'student', uid: user?.uid, classIds: workspaceId ? [workspaceId] : [] })
  useEffect(() => {
    if (!user || decks.length === 0) { setProgressByKey({}); return undefined }
    const keys = decks.map(deck => deckProgressKey(deck.classId, deck.id))
    return watchDeckProgress(user.uid, keys, setProgressByKey, () => setProgressByKey({}))
  }, [user?.uid, decks])
  useEffect(() => {
    let active = true
    if (!user?.uid) { setLessonRecent(null); return () => { active = false } }
    void listLessonPlans(user.uid).then(async plans => {
      for (const plan of plans) {
        const progress = await loadLessonProgress(user.uid, plan.id)
        const lessonId = nextLessonToResume(plan.order, progress)
        if (!lessonId || progress.lessons[lessonId]?.step === 'done') continue
        if (active) setLessonRecent({ type: 'lesson', title: plan.title, date: plan.updatedAt, href: `/${role}/learning?tab=lessons&plan=${encodeURIComponent(plan.id)}` })
        return
      }
      if (active) setLessonRecent(null)
    }).catch(() => { if (active) setLessonRecent(null) })
    return () => { active = false }
  }, [role, user?.uid])
  const studyLoad = useMemo(() => countStudyLoad(decks.map(deck => ({ classId: deck.classId, id: deck.id, cards: deck.cards } satisfies StudyDeck)), progressByKey, Date.now()), [decks, progressByKey])

  useEffect(() => {
    if (!workspaceId || !user) return undefined
    setLoading(true)
    return watchMyCanvasesAcrossClasses(user.uid, (items) => { setCanvases(items); setLoading(false); setError(null) }, (cause) => { setError(cause.message); setLoading(false) })
  }, [workspaceId, user])

  const allCanvases = useMemo(() => aggregateLearningLibrary(canvases, shared.items), [canvases, shared.items])
  const notes = allCanvases.filter((item) => item.sourceCanvasId === 'note')
  const boards = allCanvases.filter((item) => item.sourceCanvasId !== 'note')
  const recent = [...decks.map((item) => ({ type: 'deck' as const, title: item.title, date: item.updatedAt, href: `/${role}/learning?tab=decks` })), ...allCanvases.map((item) => ({ type: item.sourceCanvasId === 'note' ? 'note' as const : 'canvas' as const, title: item.title, date: item.updatedAt, href: `/${role}/classes/${encodeURIComponent(item.classId)}/${item.sourceCanvasId === 'note' ? 'notes' : 'learning'}/${encodeURIComponent(item.id)}` })), ...(lessonRecent ? [lessonRecent] : [])].sort((a,b) => b.date.toMillis() - a.date.toMillis())[0]

  const createCanvasItem = async (title: string, description: string) => {
    if (!user) return
    const id = await createCanvas(user.uid, user.uid, { kind: 'personal', title, description })
    showToast('success', 'Study canvas created.')
    navigate(`/${role}/classes/${encodeURIComponent(user.uid)}/learning/${encodeURIComponent(id)}`)
  }
  const createNote = async ({ title, content }: { classId: string; title: string; content: string }) => {
    if (!user) return undefined
    const id = await createCanvas(user.uid, user.uid, { kind: 'personal', title, description: noteDescription(content), sourceCanvasId: 'note', initialContent: { nodes: [{ id: NOTE_NODE_ID, type: 'text', x: 0, y: 0, width: 380, height: 240, color: 'none', text: content.slice(0, NOTE_CONTENT_MAX) }] } })
    return id
  }
  const changeTab = (tab: LearningTab) => setParams((old) => { const next = new URLSearchParams(old); next.set('tab', tab); next.delete('classId'); next.delete('graphId'); return next }, { replace: true })
  const tabContent = (tab: LearningTab) => {
    if (tab === 'home') return <div className="grid gap-4">
      <section className="grid gap-3 rounded-3xl border border-navy-900-15 bg-white p-5 shadow-sm" aria-labelledby="continue-heading"><h2 id="continue-heading" className="m-0 text-xl font-bold text-navy-900">Continue studying</h2>{recent ? <div className="flex flex-wrap items-center justify-between gap-3"><p className="m-0 text-base text-navy-900">{recent.title}</p><Button to={recent.href} variant="primary">Open {recent.type}</Button></div> : <p className="m-0 text-base text-navy-900">Your recent decks, notes, canvases and lessons will appear here.</p>}</section>
      <section className="grid gap-2 rounded-3xl border border-navy-900-15 bg-white p-5"><h2 className="m-0 text-lg font-bold text-navy-900">Study queue</h2><p className="m-0 text-base text-navy-900">{studyLoad.due} due · {studyLoad.new} new cards available today.</p><Button type="button" variant="secondary" onClick={() => changeTab('decks')}>Open decks</Button></section>
      <StatsHome uid={user?.uid ?? ''}/>
      <div className="flex flex-wrap gap-2"><Button variant="primary" onClick={() => setCreateDeckOpen(true)}><Plus size={16} aria-hidden="true"/>Create deck</Button><Button variant="secondary" onClick={() => changeTab('notes')}><StickyNote size={16} aria-hidden="true"/>Create note</Button><Button variant="secondary" onClick={() => setCreateOpen(true)}><Layout size={16} aria-hidden="true"/>Create canvas</Button></div>
    </div>
    if (tab === 'decks') return <>{deckError && <Alert tone="error" label="Could not load decks">{deckError}</Alert>}<FlashcardsTab decks={decks} classes={workspaceId ? [{ id: workspaceId, name: 'Personal workspace', isPersonalWorkspace: true }] : []} selectedClassId="all" role="student" error={deckError} onCreateDeck={() => setCreateDeckOpen(true)}/></>
    if (tab === 'notes') return <NotesTabContent notes={notes} classes={workspaceId ? [{ id: workspaceId, name: 'Personal workspace' }] : []} selectedClassId="all" role={role} onCreateNote={createNote} onDeleteNote={async (item) => { await deleteCanvas(item.classId, item.id) }} onViewInGraph={() => changeTab('canvases')} sharedError={shared.error}/>
    if (tab === 'canvases') return <div className="grid gap-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="m-0 text-xl font-bold text-navy-900">Your study canvases</h2><Button variant="primary" onClick={() => setCreateOpen(true)}><Plus size={16} aria-hidden="true"/>New canvas</Button></div>{loading ? <Skeleton className="h-24 rounded-2xl"/> : error ? <Alert tone="error" label="Could not load canvases">{error}</Alert> : boards.length ? <div className="grid gap-3">{boards.map((item) => <article key={`${item.classId}/${item.id}`} className="rounded-3xl border border-navy-900-15 bg-white p-5 shadow-sm"><h3 className="m-0 text-lg font-bold text-navy-900">{item.title}</h3><p className="mt-2 mb-4 text-base text-navy-900">{item.description || 'Study canvas'}</p><Button to={`/${role}/classes/${encodeURIComponent(item.classId)}/learning/${encodeURIComponent(item.id)}`} variant="secondary">Open canvas</Button></article>)}</div> : <EmptyState title="No canvases yet" description="Create a visual board to connect ideas and study materials." action={<Button variant="primary" onClick={() => setCreateOpen(true)}>Create canvas</Button>}/>}<SharedCanvasList items={shared.items} error={shared.error} role={role} selectedClassId="all"/></div>
    if (tab === 'lessons') return <Suspense fallback={<Skeleton className="h-40 rounded-2xl"/>}><LessonsTab/></Suspense>
    return <Suspense fallback={<Skeleton className="h-40 rounded-2xl"/>}><GroupsTab/></Suspense>
  }

  return <AppShell><PageHeader eyebrow="STUDY & KNOWLEDGE" title="Learning" subtitle="Build a library and keep your learning moving." action={<LearningInviteCodeInput/>}/><main className="app-shell__content"><Tabs key={activeTab} label="Learning sections" tabs={tabNames.map((tab) => ({ label: labels[tab], content: tabContent(tab) }))} defaultIndex={tabNames.indexOf(activeTab)} onChange={(index) => changeTab(tabNames[index] ?? 'home')}/></main><TutorDock defaultOpen={params.get('tab') === 'tutor' || params.has('thread')}><ChatbotTab compact/></TutorDock><CreateLearningCanvasDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={createCanvasItem} classes={workspaceId ? [{ id: workspaceId, name: 'Personal workspace' }] : []} defaultClassId={workspaceId}/>{createDeckOpen && <Suspense fallback={<div role="status" className="text-base text-navy-900">Loading create flow…</div>}><CreateLearningFlow onClose={() => setCreateDeckOpen(false)} onStudy={(deck, mode) => { setCreateDeckOpen(false); setStudyTarget({ deck, mode }) }}/></Suspense>}{studyTarget && <FlashcardStudyDialog deck={studyTarget.deck} initialMode={studyTarget.mode} onClose={() => setStudyTarget(null)}/>}</AppShell>
}
