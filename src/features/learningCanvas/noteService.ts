import { getCanvas, getContent, saveCanvas } from './services'
import { NOTE_CONTENT_MAX, getNoteText, noteDescription, withNoteText } from './noteContent'

/** Loads a note's full text. Throws, rather than returning a truncated preview, when it cannot be read. */
export async function loadNoteContent(classId: string, noteId: string): Promise<string> {
  const content = await getContent(classId, noteId)
  if (!content) throw new Error('This note could not be loaded.')
  return getNoteText(content)
}

export interface SaveNoteInput {
  title: string
  content: string
}

/**
 * Saves a note's title and content in one write, so the Notes list, the graph node and the
 * whiteboard card can never disagree. The description preview is derived from the content here.
 */
export async function saveNote(
  classId: string,
  noteId: string,
  input: SaveNoteInput,
): Promise<{ titleChanged: boolean }> {
  const title = input.title.trim()
  if (!title) throw new Error('A note needs a title.')

  const [meta, content] = await Promise.all([getCanvas(classId, noteId), getContent(classId, noteId)])
  if (!meta || !content) throw new Error('This note could not be found.')

  const text = input.content.slice(0, NOTE_CONTENT_MAX)
  await saveCanvas(classId, noteId, withNoteText(content, text), meta.updatedAt, {
    title,
    description: noteDescription(text),
  })
  return { titleChanged: title !== meta.title }
}
