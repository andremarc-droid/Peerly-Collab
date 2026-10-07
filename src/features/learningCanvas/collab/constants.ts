/** How often an open canvas tells the others "I am still here". */
export const HEARTBEAT_MS = 20_000
/** A person counts as active while their last heartbeat is newer than this (three missed beats = offline). */
export const ACTIVE_WINDOW_MS = 60_000
/**
 * Minimum gap between cursor writes. Firestore sustains roughly one write per second to a single
 * document, and each person has their own presence document, so cursors go out at most once a second.
 * The receiving side glides between points with a CSS transition of about the same length.
 */
export const CURSOR_THROTTLE_MS = 1_000
/** How often the UI re-evaluates "active vs offline" even when nothing was written. */
export const PRESENCE_TICK_MS = 15_000

export const MAX_ACTIVITY_CHANGES = 20
export const MAX_ACTIVITY_SUMMARY = 200
export const MAX_ACTIVITY_LINE = 140
export const ACTIVITY_PAGE_SIZE = 60
/** Edits are batched into one log entry per burst of work instead of one per autosave. */
export const ACTIVITY_FLUSH_MS = 20_000

export const MAX_DISPLAY_NAME = 80
/** Soft cap shown in the UI. Rules cannot count documents, so this is a client-side guard. */
export const MAX_CANVAS_MEMBERS = 30

export const INVITE_TOKEN_BYTES = 24
/** A 24-byte token encodes to 32 base64url characters, which is what the rules require. */
export const INVITE_TOKEN_LENGTH = 32
export const INVITE_EXPIRY_OPTIONS = [
  { label: '7 days', value: '7' },
  { label: '30 days', value: '30' },
  { label: 'Never expires', value: 'never' },
] as const
export type InviteExpiryOption = (typeof INVITE_EXPIRY_OPTIONS)[number]['value']
