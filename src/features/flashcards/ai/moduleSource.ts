import { MAX_EXTRA_NOTES_CHARS, MAX_SOURCE_CHARS } from './constants'

export interface SourceResource {
  type: 'drive' | 'youtube' | 'link' | 'text'
  title: string
  body?: string
}

export interface SourceModule {
  title: string
  description: string
  resources: SourceResource[]
}

export interface BuiltSource {
  text: string
  /** True when some module text had to be cut to fit the request budget. */
  truncated: boolean
  /** Text resources whose full body was available to the AI. */
  readableResources: number
  /** Drive, YouTube and link resources. Only their titles can be used; their content lives elsewhere. */
  unreadableResources: number
  /** False when there is nothing but titles to learn from. */
  hasSubstance: boolean
}

const MIN_SUBSTANCE_CHARS = 40

function collapse(text: string): string {
  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Turns selected modules (and optional pasted notes) into plain text for the model.
 * Files and videos are not readable from the browser, so they appear by title only.
 */
export function buildModuleSource(modules: SourceModule[], extraNotes = ''): BuiltSource {
  const notes = collapse(extraNotes).slice(0, MAX_EXTRA_NOTES_CHARS)
  const moduleBudget = Math.max(0, MAX_SOURCE_CHARS - notes.length)
  const perModule = modules.length > 0 ? Math.floor(moduleBudget / modules.length) : 0

  let truncated = false
  let readableResources = 0
  let unreadableResources = 0
  let substance = notes.length

  const blocks = modules.map((module) => {
    const lines: string[] = [`## Module: ${module.title}`]
    const description = collapse(module.description)
    if (description) {
      lines.push(description)
      substance += description.length
    }
    for (const resource of module.resources) {
      if (resource.type === 'text' && resource.body?.trim()) {
        readableResources += 1
        const body = collapse(resource.body)
        substance += body.length
        lines.push(`### ${resource.title}`, body)
      } else {
        unreadableResources += 1
        lines.push(`(Attached ${resource.type}: ${resource.title}. Its content is not available.)`)
      }
    }
    const block = lines.join('\n')
    if (block.length > perModule) {
      truncated = true
      return block.slice(0, perModule)
    }
    return block
  })

  const parts = [...blocks]
  if (notes) parts.push(`## Extra notes\n${notes}`)

  return {
    text: parts.join('\n\n'),
    truncated,
    readableResources,
    unreadableResources,
    hasSubstance: substance >= MIN_SUBSTANCE_CHARS,
  }
}
