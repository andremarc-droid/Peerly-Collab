import { ArrowLeft, CirclePlay, ExternalLink, FileText, FileVideo, Link2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppShell } from '../../app/AppShell'
import { useAuth } from '../auth/useAuth'
import { Alert } from '../../shared/ui/Alert'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { DataCard } from '../../shared/ui/DataCard'
import { EmptyState } from '../../shared/ui/EmptyState'
import { PageHeader } from '../../shared/ui/PageHeader'
import { Skeleton } from '../../shared/ui/Skeleton'
import { watchClass } from '../classes/services/classService'
import { listMyEnrollments } from '../classes/services/joinService'
import { watchPublishedQuizzesForClass } from '../classes/services/quizService'
import type { ClassWithId, EnrollmentWithId } from '../classes/types'
import type { QuizRecord } from '../quizzes/services/quizService'
import { quizModeLabel } from '../quizzes/types'
import { ResourceEmbed } from './ResourceEmbed'
import { buildDriveEmbedUrl, buildDriveOpenUrl, buildYouTubeEmbedUrl } from './links'
import { subscribeToModule, subscribeToResources } from './services'
import type { ModuleResourceWithId, ModuleWithId } from './types'
import './modules.css'

export function StudentModulePage() {
  const { classId = '', moduleId = '' } = useParams()
  return <StudentModuleDetail key={`${classId}:${moduleId}`} classId={classId} moduleId={moduleId} />
}

function StudentModuleDetail({ classId, moduleId }: { classId: string; moduleId: string }) {
  const { user } = useAuth()
  const [enrollment, setEnrollment] = useState<EnrollmentWithId | null>(null)
  const [enrollmentLoaded, setEnrollmentLoaded] = useState(false)
  const [classroom, setClassroom] = useState<ClassWithId | null>(null)
  const [module, setModule] = useState<ModuleWithId | null>(null)
  const [resources, setResources] = useState<ModuleResourceWithId[]>([])
  const [quizzes, setQuizzes] = useState<QuizRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!user || !classId) return undefined
    return listMyEnrollments(user.uid, (items) => {
      const match = items.find((item) => item.classId === classId && item.status === 'active') ?? null
      setEnrollment(match)
      setEnrollmentLoaded(true)
      if (!match) {
        setUnavailable(true)
      }
    }, () => {
      setUnavailable(true)
      setEnrollmentLoaded(true)
    })
  }, [user, classId, retry])

  useEffect(() => {
    if (!classId || !enrollment) return undefined
    return watchClass(
      classId,
      (value) => setClassroom(value),
      () => setUnavailable(true),
    )
  }, [classId, enrollment, retry])

  useEffect(() => {
    if (!classId || !moduleId || !enrollment) return undefined
    let cancelled = false
    const stopModule = subscribeToModule(
      classId,
      moduleId,
      (found) => {
        if (cancelled) return
        if (!found || found.status !== 'published') {
          setUnavailable(true)
          setLoading(false)
          return
        }
        setModule(found)
        setUnavailable(false)
        setLoading(false)
      },
      () => {
        if (cancelled) return
        setUnavailable(true)
        setLoading(false)
      },
    )

    const stopResources = subscribeToResources(
      classId,
      moduleId,
      (items) => {
        if (cancelled) return
        setResources(items)
      },
      () => {
        // Resources permission denied means module was unpublished or removed
        if (cancelled) return
        setUnavailable(true)
      },
    )

    const stopQuizzes = watchPublishedQuizzesForClass(
      classId,
      (items) => {
        if (cancelled) return
        setQuizzes(items)
      },
      () => {
        if (cancelled) return
      },
    )

    return () => {
      cancelled = true
      stopModule()
      stopResources()
      stopQuizzes()
    }
  }, [classId, moduleId, enrollment, retry])

  if (!enrollmentLoaded || (loading && !unavailable)) {
    return (
      <AppShell>
        <PageHeader eyebrow="STUDY MODULE" title="Loading module…" subtitle="" />
        <main className="app-shell__content grid gap-4" id="main-content">
          <Skeleton className="h-40 rounded-3xl" label="Loading module details" />
          <Skeleton className="h-72 rounded-3xl" label="Loading module resources" />
        </main>
      </AppShell>
    )
  }

  if (unavailable || !module || module.status !== 'published') {
    return (
      <AppShell>
        <PageHeader
          eyebrow="STUDY MODULE"
          title="Module no longer available"
          subtitle="This module is no longer available or was unpublished by your instructor."
          action={
            <Button to={`/student/classes/${classId}`} variant="secondary">
              <ArrowLeft size={16} aria-hidden="true" /> Back to class
            </Button>
          }
        />
        <main className="app-shell__content grid gap-4" id="main-content">
          <Alert
            tone="warning"
            label="Module no longer available"
            action={
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setLoading(true)
                  setUnavailable(false)
                  setRetry((v) => v + 1)
                }}
              >
                Retry
              </Button>
            }
          >
            This module has been unpublished or removed. Return to your class page to view other available materials.
          </Alert>
          <div>
            <Button to={`/student/classes/${classId}`} variant="secondary">
              <ArrowLeft size={16} aria-hidden="true" /> Back to class
            </Button>
          </div>
        </main>
      </AppShell>
    )
  }

  const publishedAttachedQuizzes = module.quizIds
    .map((id) => quizzes.find((q) => q.id === id && q.status === 'published'))
    .filter((q): q is QuizRecord => Boolean(q))

  return (
    <AppShell>
      <PageHeader
        eyebrow="STUDY MODULE"
        title={module.title}
        subtitle={classroom?.name ?? ''}
        action={
          <Button to={`/student/classes/${classId}`} variant="secondary">
            <ArrowLeft size={16} aria-hidden="true" /> Back to class
          </Button>
        }
        classColor={classroom?.color ?? 'navy'}
        accent={classroom?.accent}
      />
      <main className="app-shell__content grid gap-6" id="main-content">
        <nav className="module-breadcrumb" aria-label="Breadcrumb">
          <Link to="/student">Classes</Link>
          <span aria-hidden="true">›</span>
          <Link to={`/student/classes/${classId}`}>{classroom?.name ?? 'Class'}</Link>
          <span aria-hidden="true">›</span>
          <span aria-current="page">{module.title}</span>
        </nav>

        {module.description ? (
          <p className="m-0 text-base text-navy-800-72 leading-relaxed">
            {module.description}
          </p>
        ) : null}

        <section className="grid gap-4" aria-labelledby="resources-heading">
          <header>
            <span className="section-kicker">STUDY RESOURCES</span>
            <h2 id="resources-heading" className="m-0 font-heading text-2xl">Resources</h2>
          </header>
          {resources.length > 0 ? (
            <ol className="resource-list" aria-label="Module resources in order">
              {resources.map((resource) => (
                <li key={resource.id} className="resource-list__item">
                  <StudentResourceItem resource={resource} />
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState
              title="No resources in this module"
              description="Your instructor hasn’t added resources to this module yet."
            />
          )}
        </section>

        {publishedAttachedQuizzes.length > 0 && (
          <section className="grid gap-4" aria-labelledby="attached-quizzes-heading">
            <header>
              <span className="section-kicker">PRACTICE</span>
              <h2 id="attached-quizzes-heading" className="m-0 font-heading text-2xl">Attached quizzes</h2>
            </header>
            <div className="grid gap-3">
              {publishedAttachedQuizzes.map((quiz) => (
                <DataCard
                  key={quiz.id}
                  title={quiz.title}
                  meta={`${quiz.questionCount} ${quiz.questionCount === 1 ? 'question' : 'questions'}`}
                  badge={<Badge>{quizModeLabel(quiz.mode)}</Badge>}
                  actions={
                    <Button to={`/student/quizzes/${quiz.id}`} variant="secondary">
                      Start quiz
                    </Button>
                  }
                >
                  {quiz.description ? (
                    <p className="m-0 text-sm text-navy-800-72 line-clamp-2">{quiz.description}</p>
                  ) : null}
                </DataCard>
              ))}
            </div>
          </section>
        )}
      </main>
    </AppShell>
  )
}

function StudentResourceItem({ resource }: { resource: ModuleResourceWithId }) {
  const Icon = resource.type === 'youtube' ? CirclePlay : resource.type === 'drive' ? FileVideo : resource.type === 'link' ? Link2 : FileText

  if (resource.type === 'text') {
    return (
      <article className="student-resource-item">
        <div className="student-resource-header">
          <span className="resource-card__icon" aria-hidden="true"><Icon size={20} /></span>
          <h3 className="student-resource-title">{resource.title}</h3>
        </div>
        {resource.body && (
          <div className="student-resource-text">
            {resource.body}
          </div>
        )}
      </article>
    )
  }

  if (resource.type === 'link') {
    let host = 'External link'
    if (resource.url) {
      try {
        host = new URL(resource.url).hostname
      } catch {
        host = 'External link'
      }
    }
    return (
      <article className="student-resource-item">
        <div className="student-resource-header">
          <span className="resource-card__icon" aria-hidden="true"><Icon size={20} /></span>
          <div>
            <h3 className="student-resource-title">{resource.title}</h3>
            <p className="m-0 text-sm text-navy-800-72">{host}</p>
          </div>
        </div>
        <div className="pt-1">
          <a
            className="button button--secondary inline-flex items-center gap-2"
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={16} aria-hidden="true" />
            Open link
          </a>
        </div>
      </article>
    )
  }

  if (resource.type === 'youtube') {
    const embedUrl = resource.youtubeVideoId ? buildYouTubeEmbedUrl(resource.youtubeVideoId) : ''
    const fallbackUrl = resource.url || (resource.youtubeVideoId ? `https://www.youtube.com/watch?v=${resource.youtubeVideoId}` : '')
    return (
      <article className="student-resource-item">
        <div className="student-resource-header">
          <span className="resource-card__icon" aria-hidden="true"><Icon size={20} /></span>
          <h3 className="student-resource-title">{resource.title}</h3>
        </div>
        {embedUrl ? (
          <ResourceEmbed
            src={embedUrl}
            fallbackUrl={fallbackUrl}
            title={`${resource.title} preview`}
            fallbackLabel="Open on YouTube"
          />
        ) : null}
      </article>
    )
  }

  if (resource.type === 'drive') {
    const kind = resource.driveKind || 'file'
    const embedUrl = resource.driveFileId ? buildDriveEmbedUrl(kind, resource.driveFileId) : ''
    const openUrl = resource.driveFileId ? buildDriveOpenUrl(kind, resource.driveFileId) : ''
    return (
      <article className="student-resource-item">
        <div className="student-resource-header">
          <span className="resource-card__icon" aria-hidden="true"><Icon size={20} /></span>
          <h3 className="student-resource-title">{resource.title}</h3>
        </div>
        {embedUrl ? (
          <ResourceEmbed
            src={embedUrl}
            fallbackUrl={openUrl}
            title={`${resource.title} preview`}
            fallbackLabel="Open in Drive"
            fallbackMessage="Ask your instructor to share this file"
          />
        ) : null}
      </article>
    )
  }

  return null
}
