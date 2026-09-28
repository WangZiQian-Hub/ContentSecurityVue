import type { PageResult, TaskStatus } from './index'
export type Stage = 'midterm' | 'final'
export type Judgment = 'not_evaluated' | 'passed' | 'failed' | 'inconclusive'
export type Unit = 'ratio' | 'count' | 'boolean'
export type Category =
  'data_value' | 'data_governance' | 'risk_detect' | 'compliance' | 'model_capability'
export type Formula =
  | 'recall'
  | 'accuracy'
  | 'coverage'
  | 'fpr'
  | 'risk_reduction'
  | 'count'
  | 'trace_complete'
  | 'matrix'
  | 'chain_restore'
  | 'needs_definition'
export interface Threshold {
  stage: Stage
  comparator: 'gte' | 'lte' | 'eq' | 'all'
  value: number
  unit: Unit
}
export interface NamedValue {
  name: string
  value: number
}
export interface Issue {
  field: string
  reasonCode: string
  message: string
}
export interface RevisionDefinition {
  formulaCode: Formula
  formulaVersion: string
  formula: string
  denominatorDefinition: string
  positiveClass: string
  unit: Unit
  testMethod: 'automatic' | 'paired' | 'evidence'
  applicableObjects: string
  parameters: { name: string; value: string }[]
  thresholds: Threshold[]
  inputRequirements: string[]
  requiredEvidence: string[]
  sourceDocumentRefs: string[]
}
export interface MetricRevision extends RevisionDefinition {
  metricId: string
  metricCode: string
  name: string
  category: Category
  revisionId: string
  revisionNo: number
  expectedRevision: number
  configurationStatus: 'draft' | 'published' | 'needs_definition'
  createdAt: string
  publishedAt: string | null
}
export interface Metric {
  metricId: string
  code: string
  name: string
  category: Category
  description: string
  status: 'enabled' | 'disabled'
  activeRevision: MetricRevision | null
  latestRevision: MetricRevision | null
  configurationStatus: string
  issues: Issue[]
}
export interface EvaluationPageResult<T> extends PageResult<T> {
  summary: NamedValue[]
}
export interface MetricInput {
  code: string
  name: string
  category: Category
  description: string
}
export interface SourceRef {
  entityType: string
  entityId: string
  versionId: string
}
export interface SourceContext extends SourceRef {
  name: string
  sourceModule: string
  sourceTaskId: string
  sourceTraceId: string
  taskTraceId: string
  capabilityCode: string
  status: string
  algorithmMode: 'real' | 'llm' | 'mock'
  datasetId: string
  modelId: string | null
  datasetVersion: string
  labelVersion: string
  modelVersion: string | null
  evaluatorVersion: string
  contentHash: string
  sampleCount: number
  canRerun: boolean
  capturedAt: string
  interface: string
}
export interface Contexts {
  resolution: 'available' | 'unavailable'
  candidates: SourceContext[]
  issues: Issue[]
  allowedActions: string[]
}
export interface EvaluationConfig {
  schemaVersion: '1.0'
  targetStage: Stage
  executionMode: 'reference' | 'rerun'
  sourceRefs: SourceRef[]
  datasetVersionRef: string
  labelVersionRef: string
  modelVersionRef: string | null
  metricRevisionRefs: string[]
  sampleScope: { mode: 'all' }
  preflightToken: string | null
  retestOf: string | null
}
export interface Preflight {
  token: string | null
  expiresAt: string
  canCreate: boolean
  issues: Issue[]
  resolvedRefs: SourceContext[]
}
export interface EvaluationTask {
  taskId: string
  runId: string
  name: string
  status: TaskStatus
  targetStage: Stage
  datasetVersion: string
  modelVersion: string | null
  metricCount: number
  judgmentStatus: Judgment
  allowedActions: string[]
  createdAt: string
  startedAt?: string
  finishedAt?: string
  updatedAt: string
  stage: string
  traceId: string
  processedCount: number
  totalCount: number | null
  error?: string
}
export interface EvaluationEvent {
  eventId: string
  stage: string
  message: string
  status: string
  createdAt: string
}
export interface EventPage {
  items: EvaluationEvent[]
  nextCursor: number
  hasMore: boolean
}
export interface Snapshot {
  resolvedRefs: SourceContext[]
  metricRevisions: MetricRevision[]
  datasetVersion: string
  labelVersion: string
  modelVersion: string | null
  sampleManifestHash: string
  sampleCount: number
  sourceResultHashes: string[]
  evaluatorVersion: string
  executionMode: string
  createdAt: string
  targetStage: Stage
}
export interface MetricResult {
  metricCode: string
  name: string
  revisionId: string
  value: number | null
  unit: Unit
  numerator: number | null
  denominator: number | null
  counts: NamedValue[]
  thresholdSnapshot: Threshold | null
  judgmentStatus: Judgment
  reasonCode: string | null
  evidenceRefs: string[]
  gap: number | null
  formula: string
  formulaCode: Formula
}
export interface EvaluationRun {
  runId: string
  taskId: string
  recordId: string
  testNo: string
  name: string
  attemptNo: number
  retryOf: string | null
  taskStatus: TaskStatus
  judgmentStatus: Judgment
  algorithmMode: string
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  snapshot: Snapshot
  metricResults: MetricResult[]
  allowedActions: string[]
  integrityState: string
  config: EvaluationConfig
  error?: string
  exports?: ExportJob[]
}
export interface Sample {
  sampleId: string
  expected: boolean | null
  predicted: boolean | null
  baseline: boolean | null
  required: boolean
}
export interface Evidence {
  evidenceId: string
  runId: string
  kind: string
  sourceRef: SourceContext
  sha256: string
  integrityState: string
  missingFields: string[]
  redactedFields: string[]
  capturedAt: string
  allowedActions: string[]
  mimeType: string
  material: { source: SourceContext; calculation: MetricResult; capturedAt: string }
}
export interface Manifest {
  entries: Evidence[]
  integrityState: string
  checks: { name: string; valid: boolean }[]
}
export interface RecordResolution {
  resolution: 'resolved' | 'not_found' | 'ambiguous' | 'conflict' | 'demo_only'
  runId: string | null
  candidates: { runId: string }[]
}
export interface ExportJob {
  exportId: string
  runId: string
  kind: 'report' | 'evidence_bundle'
  state: 'queued' | 'running' | 'succeeded' | 'failed'
  artifactId: string | null
  error: string | null
  manifestHash: string | null
  createdAt: string
  finishedAt: string | null
}
export interface DownloadTicket {
  url: string
  expiresAt: string
  sha256: string
  fileName: string
}
export interface EvaluationSession {
  role: string
  allowedActions: string[]
}
export interface ListFilters {
  keyword?: string
  category?: string
  configurationStatus?: string
  status?: string
  stage?: string
  judgmentStatus?: string
  integrityState?: string
  from?: string
  to?: string
  terminalOnly?: boolean
  page?: number
  pageSize?: number
}
