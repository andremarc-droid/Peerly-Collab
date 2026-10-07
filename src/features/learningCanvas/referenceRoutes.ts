import type { LearningCanvasRefType } from './types'

export type CanvasViewerRole = 'student' | 'instructor'

/**
 * Builds the in-app path for a reference card, matching the routes in App.tsx:
 *
 *   student:    /student/classes/:classId/modules/:moduleId
 *               /student/quizzes/:quizId
 *               /student/classes/:classId/learning/:canvasId
 *   instructor: /instructor/classes/:classId/modules/:moduleId
 *               /instructor/quizzes/:quizId
 *               /instructor/classes/:classId/learning/:canvasId
 */
export function buildReferencePath(
  role: CanvasViewerRole,
  classId: string,
  refType: LearningCanvasRefType,
  refId: string,
): string {
  const id = encodeURIComponent(refId)
  const cls = encodeURIComponent(classId)
  switch (refType) {
    case 'module':
      return `/${role}/classes/${cls}/modules/${id}`
    case 'quiz':
      return `/${role}/quizzes/${id}`
    case 'learning':
      return `/${role}/classes/${cls}/learning/${id}`
  }
}

/** Opens a reference in a new tab without giving the new page access to this one. */
export function openReferenceInNewTab(
  role: CanvasViewerRole,
  classId: string,
  refType: LearningCanvasRefType,
  refId: string,
): void {
  window.open(buildReferencePath(role, classId, refType, refId), '_blank', 'noopener,noreferrer')
}
