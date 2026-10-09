export type MobileRole = 'instructor' | 'student'

const TAB_ROOTS = new Set([
  '/instructor',
  '/student',
  '/instructor/quizzes',
  '/instructor/learning',
  '/student/learning',
  '/profile',
])

/** Home tabs keep the bottom navigation. Everything else is a pushed screen with a back button. */
export function isMobileTabRoot(pathname: string): boolean {
  return TAB_ROOTS.has(pathname)
}

export function mobileHomePath(role: MobileRole | null): string {
  return role === 'instructor' ? '/instructor' : '/student'
}

/**
 * Where the phone back button should go. Nested class routes step up one level;
 * everything else returns to the matching home tab.
 */
export function mobileBackTo(pathname: string, role: MobileRole | null): string {
  const instructorClass = pathname.match(/^\/instructor\/classes\/([^/]+)(?:\/(.*))?$/)
  if (instructorClass) {
    return instructorClass[2] ? `/instructor/classes/${instructorClass[1]}` : '/instructor'
  }
  const studentClass = pathname.match(/^\/student\/classes\/([^/]+)(?:\/(.*))?$/)
  if (studentClass) {
    return studentClass[2] ? `/student/classes/${studentClass[1]}` : '/student'
  }
  if (pathname.startsWith('/instructor/quizzes/')) return '/instructor/quizzes'
  if (pathname.startsWith('/instructor/learning')) return '/instructor/learning'
  if (pathname.startsWith('/student/learning')) return '/student/learning'
  if (pathname.startsWith('/student/quizzes')) return '/student'
  if (pathname.startsWith('/join')) return '/student'
  if (pathname.startsWith('/learning/')) return role === 'instructor' ? '/instructor/learning' : '/student/learning'
  return mobileHomePath(role)
}
