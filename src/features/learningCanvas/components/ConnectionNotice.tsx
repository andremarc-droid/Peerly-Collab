import { Button } from '../../../shared/ui/Button'
import { Alert } from '../../../shared/ui/Alert'

/** Visible banner when a drag-connection is rejected (self-loop, duplicate, or the edge cap). */
export function ConnectionNotice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="pointer-events-auto absolute inset-x-4 bottom-4 z-40 md:inset-x-auto md:right-4 md:w-96">
      <Alert
        tone="warning"
        label="Could not connect"
        action={
          <Button type="button" variant="secondary" onClick={onDismiss}>
            Dismiss
          </Button>
        }
      >
        {message}
      </Alert>
    </div>
  )
}
