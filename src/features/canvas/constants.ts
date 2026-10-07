/**
 * Single source of truth for canvas board sizes, geometry, and styling tokens.
 */

// Node card dimensions: 240x140
export const CANVAS_CARD_WIDTH = 240
export const CANVAS_CARD_HEIGHT = 140
export const CANVAS_CARD_PADDING = 40

// Spacing between cards in tidy grid / non-overlapping slot search
export const CANVAS_GRID_GAP_X = 40
export const CANVAS_GRID_GAP_Y = 40
export const CANVAS_SLOT_WIDTH = CANVAS_CARD_WIDTH + CANVAS_GRID_GAP_X // 280
export const CANVAS_SLOT_HEIGHT = CANVAS_CARD_HEIGHT + CANVAS_GRID_GAP_Y // 180

// Handles: 28px dot indicator, 44px minimum hit area
export const CANVAS_HANDLE_HIT_SIZE = 44
export const CANVAS_HANDLE_DOT_SIZE = 28

// Edges: 2.5px stroke, larger arrowheads
export const CANVAS_EDGE_STROKE_WIDTH = 2.5
export const CANVAS_ARROWHEAD_SIZE = 22

// Selection outline: 3px
export const CANVAS_SELECTION_OUTLINE_WIDTH = 3

// Minimap dimensions: ~200x140
export const CANVAS_MINIMAP_WIDTH = 200
export const CANVAS_MINIMAP_HEIGHT = 140

// Zoom controls touch targets: at least 44px
export const CANVAS_CONTROL_BUTTON_SIZE = 44

// Viewport zoom limits and fitView options
export const CANVAS_MIN_ZOOM = 0.2
export const CANVAS_MAX_ZOOM = 2.5
export const CANVAS_FIT_VIEW_PADDING = 0.2
export const CANVAS_FIT_VIEW_MAX_ZOOM = 1.25
export const CANVAS_FIT_VIEW_MIN_ZOOM = 0.2
