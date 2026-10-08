/** A problem with a picked file that is safe and useful to show to the learner as-is. */
export class DocumentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocumentError'
  }
}
