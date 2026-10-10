const DOCUMENT_EXTENSION = /\.(pdf|docx|pptx|txt|md|markdown|csv)$/i
const HEADING = /^#{1,3}\s+(.+)$/

/**
 * Suggests a lesson topic from a leading Markdown heading, such as the "# name" line the
 * Create flow puts in front of each imported document or YouTube transcript.
 * Plain pasted notes give no suggestion, so the learner always chooses the topic.
 */
export function suggestTopicFromSource(sourceText: string, maxLength = 120): string {
  const firstLine = sourceText.trimStart().split(/\r?\n/, 1)[0] ?? ''
  const match = HEADING.exec(firstLine.trim())
  if (!match) return ''
  return match[1]!.trim().replace(DOCUMENT_EXTENSION, '').trim().slice(0, maxLength)
}
