import { Archive, ChevronRight, Copy, Ellipsis, LogOut, Palette, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '../../shared/ui/Badge'
import { DropdownMenu } from '../../shared/ui/DropdownMenu'
import { ClassInitialBadge } from '../classes/ClassInitialBadge'
import { resolveClassColor } from '../classes/types'
import type { ClassTileProps } from '../classes/ClassTile'

/** Phone class row: leading color mark, title, one line of meta, chevron — like the start-screen option cards. */
export function MobileClassTile({
  role,
  id,
  name,
  section = '',
  subject = '',
  color,
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
  availableQuizzesCount = 0,
  enrollmentStatus = 'active',
  onLeaveClass,
}: ClassTileProps) {
  const classColor = resolveClassColor(color)
  const isArchived = status === 'archived'
  const isPending = role === 'student' && enrollmentStatus === 'pending'
  const isBlocked = role === 'student' && enrollmentStatus === 'blocked'
  const isClickable = !isPending && !isBlocked
  const targetUrl = role === 'instructor' ? `/instructor/classes/${id}` : `/student/classes/${id}`
  const subtitle = [section, subject].filter(Boolean).join(' · ') || 'No section details'
  const displayedInstructorName = instructorName?.replace(/^Instructor\s+/i, '').trim() || 'Instructor'
  const meta = role === 'instructor'
    ? [
        `${studentsCount} ${studentsCount === 1 ? 'student' : 'students'}`,
        `${quizzesCount} ${quizzesCount === 1 ? 'quiz' : 'quizzes'}`,
        joinCode ? `Code ${joinCode}` : null,
      ].filter(Boolean).join(' · ')
    : isPending
      ? 'Waiting for approval from your instructor'
      : isBlocked
        ? 'Enrollment is blocked. Contact your instructor.'
        : `${availableQuizzesCount} published ${availableQuizzesCount === 1 ? 'quiz' : 'quizzes'} · Instructor · ${displayedInstructorName}`

  return (
    <article data-class-color={classColor} className={`class-tile class-tile--m3 relative ${isArchived ? 'class-tile--archived' : ''}`}>
      <div className="flex min-h-24 items-center gap-4 rounded-3xl border border-navy-900-30 bg-white p-4 text-navy-900">
        <ClassInitialBadge name={name} color={classColor} className="class-initial-badge--lg" />
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 font-heading text-xl font-semibold leading-7 text-navy-900">{name}</h3>
            {isArchived && <Badge>Archived</Badge>}
            {isPending && (
              <>
                <Badge>Waiting for approval</Badge>
                <Badge>Pending</Badge>
              </>
            )}
            {isBlocked && <Badge>Blocked</Badge>}
            {pendingCount > 0 && <Badge>{pendingCount} pending</Badge>}
          </div>
          <p className="m-0 truncate text-base leading-6 text-navy-900">{subtitle}</p>
          <p className="m-0 truncate text-sm leading-5 text-navy-800-72">{meta}</p>
        </div>
        <div className="relative z-20 shrink-0">
          <DropdownMenu
            label={`Class actions for ${name}`}
            iconOnly
            trigger={<span className="inline-flex size-11 items-center justify-center rounded-full text-navy-900"><Ellipsis size={20} aria-hidden="true" /></span>}
          >
            {role === 'instructor' ? (
              <>
                {onCopyCode && <button type="button" role="menuitem" onClick={onCopyCode}><Copy size={16} aria-hidden="true" /> Copy code</button>}
                {onEditAppearance && <button type="button" role="menuitem" onClick={onEditAppearance}><Palette size={16} aria-hidden="true" /> Edit appearance</button>}
                {onToggleArchive && (
                  <button type="button" role="menuitem" disabled={busy} onClick={onToggleArchive}>
                    {isArchived ? <><RotateCcw size={16} aria-hidden="true" /> Restore class</> : <><Archive size={16} aria-hidden="true" /> Archive class</>}
                  </button>
                )}
              </>
            ) : (
              onLeaveClass && enrollmentStatus === 'active' && (
                <button type="button" role="menuitem" onClick={onLeaveClass}><LogOut size={16} aria-hidden="true" /> Leave class</button>
              )
            )}
          </DropdownMenu>
        </div>
        {isClickable && <ChevronRight size={24} aria-hidden="true" className="relative z-20 shrink-0 text-navy-900" />}
      </div>
      {isClickable && (
        <Link to={targetUrl} className="class-tile__link" aria-label={`Open class ${name}`} />
      )}
    </article>
  )
}
