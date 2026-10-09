import { Archive, BookOpen, Copy, Ellipsis, LogOut, Palette, RotateCcw, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '../../shared/ui/Badge'
import { DropdownMenu } from '../../shared/ui/DropdownMenu'
import { useIsMobileView } from '../../lib/platform/isMobileView'
import { MobileClassTile } from '../mobile/MobileClassTile'
import { ClassInitialBadge } from './ClassInitialBadge'
import { resolveClassColor, type ClassAccent, type ClassColor, type ClassStatus, type EnrollmentStatus } from './types'

export interface ClassTileProps {
  role: 'instructor' | 'student'
  id: string
  name: string
  section?: string
  subject?: string
  color?: ClassColor
  accent?: ClassAccent
  status?: ClassStatus
  // Instructor specific
  joinCode?: string
  studentsCount?: number
  quizzesCount?: number
  pendingCount?: number
  onCopyCode?: () => void
  onEditAppearance?: () => void
  onToggleArchive?: () => void
  busy?: boolean
  // Student specific
  instructorName?: string
  instructorPhotoURL?: string | null
  availableQuizzesCount?: number
  enrollmentStatus?: EnrollmentStatus
  onLeaveClass?: () => void
}

export function ClassTile(props: ClassTileProps) {
  if (useIsMobileView()) return <MobileClassTile {...props} />

  const {
    role,
    id,
    name,
    section = '',
    subject = '',
    color,
    accent = 'pinstripe',
    status = 'active',
    joinCode,
    studentsCount = 0,
    quizzesCount = 0,
    pendingCount = 0,
    onCopyCode,
    onEditAppearance,
    onToggleArchive,
    busy = false,
    instructorName,
    instructorPhotoURL = null,
    availableQuizzesCount = 0,
    enrollmentStatus = 'active',
    onLeaveClass,
  } = props

  const classColor = resolveClassColor(color)
  const isArchived = status === 'archived'
  const isPending = role === 'student' && enrollmentStatus === 'pending'
  const isBlocked = role === 'student' && enrollmentStatus === 'blocked'
  const isClickable = !isPending && !isBlocked

  const targetUrl = role === 'instructor' ? `/instructor/classes/${id}` : `/student/classes/${id}`
  const subtitle = [section, subject].filter(Boolean).join(' · ') || 'No section details'
  const displayedInstructorName = instructorName?.replace(/^Instructor\s+/i, '').trim() || 'Instructor'

  return (
    <article
      data-class-color={classColor}
      className={`class-tile ${isArchived ? 'class-tile--archived' : ''}`}
    >
      {/* Header (about 112px) in class color with masked pattern */}
      <div className="class-tile__header">
        {accent !== 'solid' && (
          <span
            className={`class-tile__pattern class-tile__pattern--${accent}`}
            aria-hidden="true"
          />
        )}
        <div className="class-tile__header-top">
          <div className="class-tile__title-group">
            <div className="flex items-center gap-2 mb-1">
              <ClassInitialBadge name={name} color={classColor} />
              {isArchived && <Badge>Archived</Badge>}
              {isPending && (
                <>
                  <Badge>Waiting for approval</Badge>
                  <Badge>Pending</Badge>
                </>
              )}
              {isBlocked && <Badge>Blocked</Badge>}
            </div>
            <h3 className="class-tile__name" title={name}>
              {name}
            </h3>
            <p className="class-tile__subtitle" title={subtitle}>
              {subtitle}
            </p>
          </div>

          {/* Overflow Menu (three dots) above stretched link */}
          <div className="class-tile__menu">
            <DropdownMenu
              label={`Class actions for ${name}`}
              trigger={
                <span className="class-tile__menu-btn">
                  <Ellipsis size={18} aria-hidden="true" />
                </span>
              }
            >
              {role === 'instructor' ? (
                <>
                  {onCopyCode && (
                    <button type="button" role="menuitem" onClick={onCopyCode}>
                      <Copy size={16} aria-hidden="true" /> Copy code
                    </button>
                  )}
                  {onEditAppearance && (
                    <button type="button" role="menuitem" onClick={onEditAppearance}>
                      <Palette size={16} aria-hidden="true" /> Edit appearance
                    </button>
                  )}
                  {onToggleArchive && (
                    <button type="button" role="menuitem" disabled={busy} onClick={onToggleArchive}>
                      {isArchived ? (
                        <>
                          <RotateCcw size={16} aria-hidden="true" /> Restore class
                        </>
                      ) : (
                        <>
                          <Archive size={16} aria-hidden="true" /> Archive class
                        </>
                      )}
                    </button>
                  )}
                </>
              ) : (
                <>
                  {onLeaveClass && enrollmentStatus === 'active' && (
                    <button type="button" role="menuitem" onClick={onLeaveClass}>
                      <LogOut size={16} aria-hidden="true" /> Leave class
                    </button>
                  )}
                </>
              )}
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="class-tile__body">
        {role === 'instructor' ? (
          <>
            <div className="class-tile__meta">
              <span className="class-tile__meta-item" title={`${studentsCount} enrolled students`}>
                <Users size={16} className="text-navy-900" aria-hidden="true" />
                <span className="font-semibold text-navy-900">{studentsCount}</span>
                <span>{studentsCount === 1 ? 'student' : 'students'}</span>
              </span>
              <span className="class-tile__meta-item" title={`${quizzesCount} assigned quizzes`}>
                <BookOpen size={16} className="text-navy-900" aria-hidden="true" />
                <span className="font-semibold text-navy-900">{quizzesCount}</span>
                <span>{quizzesCount === 1 ? 'quiz' : 'quizzes'}</span>
              </span>
              {pendingCount > 0 && (
                <Badge>{pendingCount} pending</Badge>
              )}
            </div>
            <InstructorIdentity name={displayedInstructorName} photoURL={instructorPhotoURL} />

            {joinCode && (
              <div className="flex items-center justify-between text-sm text-navy-800-72 pt-2 border-t border-navy-900-08">
                <span>Code</span>
                <span className="font-mono text-sm font-bold tracking-widest text-navy-900">
                  {joinCode}
                </span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="class-tile__meta">
              {!isPending && !isBlocked && (
                <span className="class-tile__meta-item" title={`${availableQuizzesCount} published quizzes`}>
                  <BookOpen size={16} className="text-navy-900" aria-hidden="true" />
                  <span>{`${availableQuizzesCount} published ${availableQuizzesCount === 1 ? 'quiz' : 'quizzes'}`}</span>
                </span>
              )}
            </div>
            <InstructorIdentity name={displayedInstructorName} photoURL={instructorPhotoURL} />

            {isPending && (
              <div className="rounded-xl bg-navy-900-08 p-2.5 text-sm text-navy-800-72 font-medium">
                Waiting for approval from your instructor
              </div>
            )}

            {isBlocked && (
              <div className="rounded-xl bg-navy-900-08 p-2.5 text-sm text-navy-800-72 font-medium">
                Enrollment is blocked. Contact your instructor.
              </div>
            )}
          </>
        )}
      </div>

      {/* Stretched link covering the entire tile (only when clickable) */}
      {isClickable && (
        <Link
          to={targetUrl}
          className="class-tile__link"
          aria-label={`Open class ${name}`}
        />
      )}
    </article>
  )
}

function InstructorIdentity({ name, photoURL }: { name: string; photoURL: string | null }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5" aria-label={`Instructor: ${name}`}>
      {photoURL
        ? <img src={photoURL} alt="" className="size-9 shrink-0 rounded-full border border-navy-900-12 object-cover" />
        : <span className="grid size-9 shrink-0 place-items-center rounded-full border border-navy-900-12 bg-navy-900-08 text-sm font-bold text-navy-900" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>}
      <span className="min-w-0 truncate text-sm font-semibold text-navy-900">Instructor · {name}</span>
    </div>
  )
}
