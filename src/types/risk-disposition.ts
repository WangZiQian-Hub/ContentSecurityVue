import type { Level } from './data-risk'

export type DispositionStatus =
  'PENDING_REVIEW' | 'PENDING_ACTION' | 'PENDING_APPROVAL' | 'APPROVED' | 'DISMISSED' | 'PUBLISHED'
export type ReviewDecision = 'confirm' | 'adjust' | 'dismiss'
export type RiskTreatment = 'redact' | 'correct' | 'exclude'
export type DispositionCommand =
  | { action: 'submit' }
  | { action: 'confirm' | 'dismiss' | 'approve' | 'return'; note: string }
  | { action: 'adjust'; note: string; level: Level }
  | { action: 'propose'; note: string; treatment: RiskTreatment; replacementText?: string }

export interface RiskDisposition {
  sampleId: string
  inputSampleRevisionId: string
  originalLevel: Level
  originalCategory: string
  status: DispositionStatus
  decision: ReviewDecision | null
  reviewedLevel: Level | null
  treatment: RiskTreatment | null
  replacementText: string | null
  events: {
    action: DispositionCommand['action'] | 'publish'
    note: string
    actor: string
    at: string
  }[]
  publishedVersionId: string | null
}

export interface RiskPublication {
  newDatasetVersionId: string
  versionLabel: string
  sampleCount: number
}

export interface RiskPublicationPreview {
  token: string
  sourceVersionLabel: string
  replacedCount: number
  excludedCount: number
  sampleCount: number
}

export interface RiskDispositionState {
  editable: boolean
  sourceVersionLabel: string
  reviews: RiskDisposition[]
  published: RiskPublication | null
}
