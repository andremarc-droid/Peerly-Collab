import { ArrowLeft, CirclePlay, ExternalLink, File, FileSpreadsheet, FileText, Link2, Presentation } from 'lucide-react'
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
import type { DriveKind, ModuleResourceWithId, ModuleWithId } from './types'
import './modules.css'

export function StudentModulePage() {
  const { classId = '', moduleId = '' } = useParams()
  return <StudentModuleDetail key={`${classId}:${moduleId}`} classId={classId} moduleId={moduleId} />
}

function DriveIcon({ kind }: { kind?: DriveKind }) {
  switch (kind) {
    case 'doc':
      return <FileText size={20} />
    case 'sheet':
      return <FileSpreadsheet size={20} />
    case 'slides':
      return <Presentation size={20} />
    case 'file':
    default:
      return <File size={20} />
  }
}

function StudentModuleDetail({ classId, moduleId }: { classId: string; moduleId: string }) {
  const { user } = useAuth()
  const [enrollment, setEnrollment] = useState<EnrollmentWithId | null>(null)
  const [enrollmentLoaded, setEnrollmentLoaded] = useState(false)
  const [classroom, setClassroom] = useState<ClassWithId | null>(null)

  // Module state
  const [module, setModule] = useState<ModuleWithId | null>(null)
  const [moduleLoading, setModuleLoading] = useState(true)
  const [moduleNotFound, setModuleNotFound] = useState(false)
  const [moduleError, setModuleError] = useState<string | null>(null)
  const [moduleRetry, setModuleRetry] = useState(0)

  // Resources state
  const [resources, setResources] = useState<ModuleResourceWithId[]>([])
  const [resourcesLoading, setResourcesLoading] = useState(true)
  const [resourcesError, setResourcesError] = useState<string | null>(null)
  const [resourcesRetry, setResourcesRetry] = useState(0)

  // Quizzes state
  const [quizzes, setQuizzes] = useState<QuizRecord[]>([])
  const [quizzesLoading, setQuizzesLoading] = useState(true)
  const [quizzesError, setQuizzesError] = useState<string | null>(null)
  const [quizzesRetry, setQuizzesRetry] = useState(0)

  useEffect(() => {
    if (!user || !classId) return undefined
    return listMyEnrollments(user.uid, (items) => {
      const match = items.find((item) => item.classId === classId && item.status === 'active') ?? null
      setEnrollment(match)
      setEnrollmentLoaded(true)
      if (!match) {
        setModuleNotFound(true)
        setModuleLoading(false)
      }
    }, () => {
      setModuleError("We couldn't load this module")
      setModuleLoading(false)
      setEnrollmentLoaded(true)
    })
  }, [user, classId, moduleRetry])

  useEffect(() => {
    if (!classId || !enrollment) return undefined
    return watchClass(
      classId,
      (value) => setClassroom(value),
      () => {
        setModuleError("We couldn't load this module")
        setModuleLoading(false)
      },
    )
  }, [classId, enrollment, moduleRetry])

  useEffect(() => {
    if (!classId || !moduleId || !enrollment) return undefined
    let cancelled = false
    const stopModule = subscribeToModule(
      classId,
      moduleId,
      (found) => {
        if (cancelled) return
        if (!found || found.status !== 'published') {
          setModule(null)
          setModuleNotFound(true)
          setModuleLoading(false)
          setModuleError(null)
          return
        }
        setModule(found)
        setModuleNotFound(false)
        setModuleLoading(false)
        setModuleError(null)
      },
      (err) => {
        if (cancelled) return
        setModuleError(err.message || "We couldn't load this module")
        setModuleNotFound(false)
        setModuleLoading(false)
      },
    )

    return () => {
      cancelled = true
      stopModule()
    }
  }, [classId, moduleId, enrollment, moduleRetry])

  useEffect(() => {
    if (!classId || !moduleId || !module?.id) return undefined
    let cancelled = false
    const stopResources = subscribeToResources(
      classId,
      moduleId,
      (items) => {
        if (cancelled) return
        setResources(items)
        setResourcesLoading(false)
        setResourcesError(null)
      },
      (err) => {
        if (cancelled) return
        setResourcesError(err.message)
        setResourcesLoading(false)
      },
    )

    return () => {
      cancelled = true
      stopResources()
    }
  }, [classId, moduleId, module?.id, resourcesRetry])

  const hasAttachedQuizzes = Boolean(module?.quizIds && module.quizIds.length > 0)

  useEffect(() => {
    if (!classId || !module?.id || !hasAttachedQuizzes) return undefined
    let cancelled = false
    const stopQuizzes = watchPublishedQuizzesForClass(
      classId,
      (items) => {
        if (cancelled) return
        setQuizzes(items)
        setQuizzesLoading(false)
        setQuizzesError(null)
      },
      (err) => {
        if (cancelled) return
        setQuizzesError(err.message)
        setQuizzesLoading(false)
      },
    )

    return () => {
      cancelled = true
      stopQuizzes()
    }
  }, [classId, module?.id, hasAttachedQuizzes, quizzesRetry])

  if (!enrollmentLoaded || (moduleLoading && !moduleError && !moduleNotFound)) {
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

  if (moduleNotFound) {
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
          <Alert tone="warning" label="Module no longer available">
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

  if (moduleError || !module) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="STUDY MODULE"
          title="Module unavailable"
          subtitle="We couldn't load this module."
          action={
            <Button to={`/student/classes/${classId}`} variant="secondary">
              <ArrowLeft size={16} aria-hidden="true" /> Back to class
            </Button>
          }
        />
        <main className="app-shell__content grid gap-4" id="main-content">
          <Alert
            tone="error"
            label="We couldn't load this module"
            action={
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setModuleLoading(true)
                  setModuleError(null)
                  setModuleRetry((v) => v + 1)
                }}
              >
                Retry
              </Button>
            }
          >
            We couldn't load this module. Please try again.
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
          {resourcesLoading ? (
            <div className="grid gap-3">
              {[0, 1].map((index) => (
                <Skeleton key={index} className="h-32 rounded-3xl" label="Loading module resources" />
              ))}
            </div>
          ) : resourcesError ? (
            <Alert
              tone="error"
              label="Resources unavailable"
              action={
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setResourcesLoading(true)
                    setResourcesError(null)
                    setResourcesRetry((v) => v + 1)
                  }}
                >
                  Retry
                </Button>
              }
            >
              {resourcesError}
            </Alert>
          ) : resources.length > 0 ? (
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

        {quizzesError ? (
          <section className="grid gap-4" aria-labelledby="attached-quizzes-heading">
            <header>
              <span className="section-kicker">PRACTICE</span>
              <h2 id="attached-quizzes-heading" className="m-0 font-heading text-2xl">Attached quizzes</h2>
            </header>
            <div className="flex items-center justify-between gap-3 p-4 rounded-xl border border-navy-900-12 bg-white" role="alert">
              <p className="m-0 text-sm text-navy-800-72">We couldn't load attached quizzes.</p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setQuizzesLoading(true)
                  setQuizzesError(null)
                  setQuizzesRetry((v) => v + 1)
                }}
              >
                Retry
              </Button>
            </div>
          </section>
        ) : quizzesLoading && module.quizIds.length > 0 ? (
          <section className="grid gap-4" aria-labelledby="attached-quizzes-heading">
            <header>
              <span className="section-kicker">PRACTICE</span>
              <h2 id="attached-quizzes-heading" className="m-0 font-heading text-2xl">Attached quizzes</h2>
            </header>
            <div className="grid gap-3">
              {[0, 1].map((index) => (
                <Skeleton key={index} className="h-24 rounded-2xl" label="Loading attached quizzes" />
              ))}
            </div>
          </section>
        ) : publishedAttachedQuizzes.length > 0 ? (
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
        ) : null}
      </main>
    </AppShell>
  )
}

function StudentResourceItem({ resource }: { resource: ModuleResourceWithId }) {
  if (resource.type === 'text') {
    return (
      <article className="student-resource-item">
        <div className="student-resource-header">
          <span className="resource-card__icon" aria-hidden="true"><FileText size={20} /></span>
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
          <span className="resource-card__icon" aria-hidden="true"><Link2 size={20} /></span>
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
          <span className="resource-card__icon" aria-hidden="true"><CirclePlay size={20} /></span>
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
          <span className="resource-card__icon" aria-hidden="true"><DriveIcon kind={kind} /></span>
          <h3 className="student-resource-title">{resource.title}</h3>
        </div>
        {embedUrl ? (
          <ResourceEmbed
            src={embedUrl}
            fallbackUrl={openUrl}
            title={`${resource.title} preview`}
            fallbackLabel="Open in Drive"
            fallbackMessage="Preview not loading? Sign in with the Google account your instructor shared this with, or ask them to share the file."
          />
        ) : null}
      </article>
    )
  }

  return null
}
