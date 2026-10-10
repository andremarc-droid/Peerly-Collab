/** Study material handed to the Create flow from somewhere else in Learning, such as a saved note. */
export interface CreateSeed {
  title: string
  text: string
}

/**
 * Builds the Create flow's source text from a seed. The title becomes a leading Markdown heading,
 * the same shape imported documents use, so the AI gets the context and lesson plans can suggest a topic.
 */
export function seedSourceText(seed: CreateSeed): string {
  const title = seed.title.replace(/\s+/g, ' ').trim()
  const text = seed.text.trim()
  if (!text) return ''
  return title ? `# ${title}\n\n${text}` : text
}
