import type { LearningCanvasColor } from './types'

export const LEARNING_CANVAS_COLORS: LearningCanvasColor[] = [
  'none',
  'navy',
  'tint',
  'c1',
  'c2',
  'c3',
  'c4',
  'c5',
  'c6',
]

export const MAX_LEARNING_CANVAS_NODES = 80
export const MAX_LEARNING_CANVAS_GROUPS = 10
export const MAX_LEARNING_CANVAS_EDGES = 120
export const MAX_LEARNING_CANVAS_REFS = 80

export const MIN_NODE_COORD = -20000
export const MAX_NODE_COORD = 20000
export const MIN_NODE_DIMENSION = 80
export const MAX_NODE_DIMENSION = 1200

export const MAX_TEXT_NODE_LENGTH = 2000
export const MAX_LINK_TITLE_LENGTH = 120
export const MAX_LINK_NOTE_LENGTH = 300
export const MAX_GROUP_LABEL_LENGTH = 80
export const MAX_EDGE_LABEL_LENGTH = 80

export const MAX_CANVAS_TITLE_LENGTH = 120
export const MAX_CANVAS_DESCRIPTION_LENGTH = 300

// Aliases for editor components
export const LEARNING_CANVAS_TEXT_MAX = MAX_TEXT_NODE_LENGTH
export const LEARNING_CANVAS_TITLE_MAX = MAX_CANVAS_TITLE_LENGTH
export const LEARNING_CANVAS_DESCRIPTION_MAX = MAX_CANVAS_DESCRIPTION_LENGTH
export const LEARNING_CANVAS_GROUP_LABEL_MAX = MAX_GROUP_LABEL_LENGTH
export const LEARNING_CANVAS_EDGE_LABEL_MAX = MAX_EDGE_LABEL_LENGTH

export interface ResolvedCanvasColorStyles {
  background: string
  border: string
  text: string
  headerBg?: string
  accent?: string
}

/**
 * Pure function mapping a learning canvas color token to visual styling,
 * optionally influenced by the classroom's theme color.
 */
export function mapLearningCanvasColor(
  color: LearningCanvasColor,
  classColor = 'navy',
): ResolvedCanvasColorStyles {
  switch (color) {
    case 'navy':
      return {
        background: 'var(--color-white)',
        border: 'var(--color-navy-800)',
        text: 'var(--color-navy-900)',
        headerBg: 'var(--color-navy-700-05)',
        accent: 'var(--color-navy-800)',
      }
    case 'tint':
      return {
        background: 'var(--color-navy-700-05)',
        border: 'var(--color-navy-900-22)',
        text: 'var(--color-navy-900)',
        headerBg: 'var(--color-navy-700-07)',
        accent: 'var(--color-navy-700)',
      }
    case 'c1': // Red / Crimson
      return {
        background: 'var(--color-feedback-error-bg)',
        border: 'var(--color-feedback-error)',
        text: 'var(--color-feedback-error)',
        headerBg: 'var(--color-feedback-error-bg)',
        accent: 'var(--color-feedback-error)',
      }
    case 'c2': // Orange / Amber / Rust
      return {
        background: 'var(--color-feedback-warning-bg)',
        border: 'var(--color-feedback-warning)',
        text: 'var(--color-feedback-warning)',
        headerBg: 'var(--color-feedback-warning-bg)',
        accent: 'var(--color-feedback-warning)',
      }
    case 'c3': // Yellow
      return {
        background: 'var(--color-feedback-warning-bg)',
        border: 'var(--color-feedback-warning)',
        text: 'var(--color-feedback-warning)',
        headerBg: 'var(--color-feedback-warning-bg)',
        accent: 'var(--color-feedback-warning)',
      }
    case 'c4': // Green / Emerald
      return {
        background: 'var(--color-feedback-success-bg)',
        border: 'var(--color-feedback-success)',
        text: 'var(--color-feedback-success)',
        headerBg: 'var(--color-feedback-success-bg)',
        accent: 'var(--color-feedback-success)',
      }
    case 'c5': // Cyan / Teal / Ocean
      return {
        background: 'var(--class-tint)',
        border: 'var(--class-color)',
        text: 'var(--class-color-deep)',
        headerBg: 'var(--class-tint)',
        accent: 'var(--class-color)',
      }
    case 'c6': // Purple / Indigo
      return {
        background: 'var(--class-tint)',
        border: 'var(--class-color)',
        text: 'var(--class-color-deep)',
        headerBg: 'var(--class-tint)',
        accent: 'var(--class-color)',
      }
    case 'none':
    default:
      return {
        background: 'var(--color-white)',
        border: 'var(--color-navy-900-12)',
        text: 'var(--color-navy-900)',
        headerBg: 'var(--color-navy-700-05)',
        accent: classColor === 'teal' ? 'var(--class-color)' : 'var(--color-navy-800)',
      }
  }
}
