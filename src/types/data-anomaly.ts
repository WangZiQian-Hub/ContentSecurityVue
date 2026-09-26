import type { ResourceSample } from './data-resource'
import type { ValueScope, ValueOptions } from './data-value'
export const ANOMALY_KIND = 'governance-anomaly'
export type Scope = ValueScope
export type Status = '待处理' | '待复核' | '已处理'
export interface Rule {
  id: string
  name: string
  description: string
}
export interface Options {
  datasets: ValueOptions['datasets']
  schemes: { id: string; name: string }[]
  rules: Rule[]
  types: string[]
}
export interface Candidate {
  candidateId: string
  inputSampleRevisionId: string
  replacesCandidateId?: string
  fieldChanges: { field: string; before: string; after: string }[]
  reason: string
  validationResults: { name: string; passed: boolean }[]
  status: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'PUBLISHED' | 'WITHDRAWN'
}
export interface Sample extends ResourceSample {
  revisionId: string
  primaryType: string
  status: Status
  resolution?: string
  findings: { type: string; field: string; reason: string; quote: string; ruleId: string }[]
  source: { filename?: string; line?: number }
  metadata: Record<string, string>
  candidates: Candidate[]
  timeline: { at: string; message: string }[]
  actions: string[]
}
export interface Result {
  id: string
  taskId: string
  scope: Scope
  datasetName: string
  versionLabel: string
  finishedAt: string
  validCount: number
  failedCount: number
  unavailableCount: number
  anomalyCount: number
  ratio: number
  pendingCount: number
  reviewCount: number
  processedCount: number
  primaryTypeCounts: { type: string; count: number }[]
}
export interface Task {
  taskId: string
  input: Scope
  status: 'running' | 'succeeded' | 'failed'
  resultId?: string
  createdAt: string
  coverage: number
  ruleVersion: string
  modelVersion: string
  errorMessage?: string
}
export interface Query {
  page: number
  pageSize: number
  keyword: string
  type: string
  status: string
}
export interface ChangeSet {
  id: string
  datasetId: number
  versionId: string
  versionLabel: string
  updatedAt: string
  entries: {
    sampleId: string
    candidateId: string
    changes: Candidate['fieldChanges']
    conflict?: string
  }[]
  excluded: string[]
  conflicts: number
  actions: string[]
}
export interface VersionCheck {
  token: string
  count: number
  excluded: string[]
  valid: boolean
  errors: string[]
  targetDescription: string
}
export interface Published {
  newDatasetVersionId: string
  versionLabel: string
}
export interface Overview {
  cards: { label: string; value: number; icon: string }[]
  definitions: string[]
}
