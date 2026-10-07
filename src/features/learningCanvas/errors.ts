/**
 * Thrown by saveCanvas when the stored canvas was changed by another session
 * after this editor loaded it. The editor matches on this class (not on the
 * message text) to decide whether to show the version-conflict dialog.
 */
export class CanvasConflictError extends Error {
  constructor(
    message = 'Canvas has been modified by another session. Please reload to see the latest changes.',
  ) {
    super(message)
    this.name = 'CanvasConflictError'
  }
}
