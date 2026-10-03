import type { Timestamp } from 'firebase/firestore'

export type ModuleStatus = 'draft' | 'published'
export type ResourceType = 'drive' | 'youtube' | 'link' | 'text'
export type DriveKind = 'file' | 'doc' | 'sheet' | 'slides'
export interface ModuleRecord { ownerId: string; title: string; description: string; order: number; status: ModuleStatus; quizIds: string[]; resourceCount: number; createdAt: Timestamp; updatedAt: Timestamp; publishedAt: Timestamp | null }
export interface ModuleWithId extends ModuleRecord { id: string; classId: string }
export interface ModuleResource { type: ResourceType; title: string; order: number; url?: string; driveFileId?: string; driveKind?: DriveKind; youtubeVideoId?: string; body?: string; createdAt: Timestamp; updatedAt: Timestamp }
export interface ModuleResourceWithId extends ModuleResource { id: string }
