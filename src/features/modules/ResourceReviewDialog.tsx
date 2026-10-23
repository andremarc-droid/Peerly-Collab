import { ExternalLink, File, FileSpreadsheet, FileText, Link2, Presentation } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { Dialog } from '../../shared/ui/Dialog'
import { ResourceEmbed } from './ResourceEmbed'
import { buildDriveEmbedUrl, buildDriveOpenUrl, buildYouTubeEmbedUrl } from './links'
import type { DriveKind, ModuleResourceWithId, ResourceType } from './types'

const kindName: Record<DriveKind, string> = {
  file: 'Google Drive file',
  doc: 'Google Doc',
  sheet: 'Google Sheet',
  slides: 'Google Slides',
}

const resourceTypeLabel: Record<ResourceType, string> = {
  drive: 'Google Drive file',
  youtube: 'YouTube video',
  link: 'Link',
  text: 'Note',
}

function DriveIcon({ kind }: { kind?: DriveKind }) {
  switch (kind) {
    case 'doc':
      return <FileText size={18} aria-hidden="true" />
    case 'sheet':
      return <FileSpreadsheet size={18} aria-hidden="true" />
    case 'slides':
      return <Presentation size={18} aria-hidden="true" />
    case 'file':
    default:
      return <File size={18} aria-hidden="true" />
  }
}

export interface ResourceReviewDialogProps {
  open: boolean
  resource: ModuleResourceWithId | null
  onClose: () => void
  onEdit?: (resource: ModuleResourceWithId) => void
}

export function ResourceReviewDialog({ open, resource, onClose, onEdit }: ResourceReviewDialogProps) {
  if (!open || !resource) return null

  return (
    <Dialog
      open
      onClose={onClose}
      title={resource.title}
      description={`Review ${resourceTypeLabel[resource.type]}`}
      className="resource-review-dialog"
    >
      <div className="grid gap-4">
        {resource.type === 'drive' && <DriveReview resource={resource} />}
        {resource.type === 'youtube' && <YouTubeReview resource={resource} />}
        {resource.type === 'link' && <LinkReview resource={resource} />}
        {resource.type === 'text' && <TextReview resource={resource} />}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-navy-900-12">
          {onEdit ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                onClose()
                onEdit(resource)
              }}
            >
              Edit resource
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function DriveReview({ resource }: { resource: ModuleResourceWithId }) {
  const kind = resource.driveKind || 'file'
  let embedUrl = ''
  let openUrl = resource.url || ''

  if (resource.driveFileId) {
    try {
      embedUrl = buildDriveEmbedUrl(kind, resource.driveFileId)
      openUrl = buildDriveOpenUrl(kind, resource.driveFileId)
    } catch {
      embedUrl = ''
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2 text-sm text-navy-800-72">
        <DriveIcon kind={kind} />
        <span>{kindName[kind]}</span>
      </div>
      {embedUrl ? (
        <ResourceEmbed
          src={embedUrl}
          fallbackUrl={openUrl}
          title={`${resource.title} preview`}
          fallbackLabel="Open in Google Drive"
          fallbackMessage="Preview not loading? Check file permissions in Google Drive (Anyone with the link can view)."
        />
      ) : openUrl ? (
        <div className="grid gap-3 p-4 rounded-2xl border border-navy-900-12 bg-white">
          <p className="m-0 text-sm text-navy-800-72">Preview not available for this file.</p>
          <div>
            <a
              className="button button--secondary inline-flex items-center gap-2"
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={16} aria-hidden="true" />
              Open in Google Drive
            </a>
          </div>
        </div>
      ) : (
        <p className="m-0 text-sm text-navy-800-72">No file link provided.</p>
      )}
    </div>
  )
}

function YouTubeReview({ resource }: { resource: ModuleResourceWithId }) {
  let embedUrl = ''
  let fallbackUrl = resource.url || ''

  if (resource.youtubeVideoId) {
    try {
      embedUrl = buildYouTubeEmbedUrl(resource.youtubeVideoId)
      if (!fallbackUrl) fallbackUrl = `https://www.youtube.com/watch?v=${resource.youtubeVideoId}`
    } catch {
      embedUrl = ''
    }
  }

  return (
    <div className="grid gap-3">
      {embedUrl ? (
        <ResourceEmbed
          src={embedUrl}
          fallbackUrl={fallbackUrl}
          title={`${resource.title} preview`}
          fallbackLabel="Open on YouTube"
        />
      ) : fallbackUrl ? (
        <div className="grid gap-3 p-4 rounded-2xl border border-navy-900-12 bg-white">
          <p className="m-0 text-sm text-navy-800-72">Video preview not available.</p>
          <div>
            <a
              className="button button--secondary inline-flex items-center gap-2"
              href={fallbackUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={16} aria-hidden="true" />
              Open on YouTube
            </a>
          </div>
        </div>
      ) : (
        <p className="m-0 text-sm text-navy-800-72">No YouTube link provided.</p>
      )}
    </div>
  )
}

function LinkReview({ resource }: { resource: ModuleResourceWithId }) {
  let host = 'External link'
  if (resource.url) {
    try {
      host = new URL(resource.url).hostname
    } catch {
      host = 'External link'
    }
  }

  return (
    <div className="grid gap-3 p-5 rounded-2xl border border-navy-900-12 bg-white">
      <div className="flex items-center gap-2 text-sm font-semibold text-navy-900">
        <Link2 size={18} className="text-navy-800" aria-hidden="true" />
        <span>{host}</span>
      </div>
      {resource.url && (
        <p className="m-0 text-sm text-navy-800-72 break-all">{resource.url}</p>
      )}
      <div className="pt-1">
        <a
          className="button button--primary inline-flex items-center gap-2"
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={16} aria-hidden="true" />
          Open link
        </a>
      </div>
    </div>
  )
}

function TextReview({ resource }: { resource: ModuleResourceWithId }) {
  return (
    <div className="grid gap-2 p-5 rounded-2xl border border-navy-900-12 bg-white">
      <div className="student-resource-text">
        {resource.body || 'No text content.'}
      </div>
    </div>
  )
}
