import type { PageResult, TaskStatus } from './index'

export type EntityId = string | number
export type VerificationState =
  'verified' | 'missing' | 'unavailable' | 'not_applicable' | 'unknown'
export type Capability =
  'lineage_audit' | 'training_monitor' | 'reasoning_audit' | 'neuron_audit' | 'full_chain_audit'
export type ComplianceTab = '' | 'lineage' | 'full-chain' | 'model-internal' | 'risk-alert'
export interface SubjectRef {
  entityType: string
  entityId: EntityId
  versionId: string | null
  displayId: string
  label: string
}
export interface ContextQuery {
  sourceKind: string
  sourceId?: EntityId
  traceId?: string
}
export interface ContextCandidate {
  sourceKind: string
  sourceId: EntityId
  subjectRef: SubjectRef
  modelVersion: string | null
  captureId: string | null
  label: string
}
export interface ComplianceContext {
  resolution: 'resolved' | 'not_found' | 'ambiguous' | 'conflict'
  subjectRef: SubjectRef | null
  taskId: string | null
  inferenceId: string | null
  traceId: string | null
  modelId: EntityId | null
  modelVersion: string | null
  captureId: string | null
  candidates: ContextCandidate[]
}
export interface OverviewQuery {
  from: string
  to: string
  scope: string
}
export interface Handoff {
  kind: string
  label: string
  expectedCount: number | null
  verifiedCount: number | null
  missingCount: number | null
  unavailableCount: number | null
  missingReason: string | null
  target: ComplianceTab
  subjectRef: SubjectRef | null
}
export interface Overview {
  asOf: string
  scope: string
  scopeDescription: string
  expectedCount: number | null
  missingCount: number | null
  handoffs: Handoff[]
  pendingReviewsCount: number | null
  completedAuditsCount: number | null
}
export interface LineageQuery {
  entityType: string
  entityId: EntityId
  versionId?: string
  direction: 'upstream' | 'downstream' | 'both'
}
export interface LineageNode extends SubjectRef {
  id: string
  type: string
}
export interface LineageEdge {
  id: string
  fromId: string
  toId: string
  relation: string
  verificationState: VerificationState
  evidenceRefs: string[]
  missingReason: string | null
  trainingTaskId: string | null
}
export interface Gap {
  reason: string
  evidenceRefs: string[]
  alertId: string | null
}
export interface Lineage {
  nodes: LineageNode[]
  edges: LineageEdge[]
  gaps: Gap[]
}
export interface EvidenceCheck {
  key: string
  label: string
  required: boolean
  state: VerificationState
  evidenceRefs: string[]
  missingReason: string | null
  stage?: string
}
export interface RuleCheck extends EvidenceCheck {
  ruleId: string
  ruleVersion: string
  occurredAt: string
  detail: string
}
export interface Checkpoint {
  id: string
  label: string
  expectedVersion: string
  snapshotRef: string | null
  ruleVersion: string
  evidenceRefs: string[]
}
export interface TrainingResult {
  kind: 'training_monitor'
  checks: RuleCheck[]
  checkpoints: Checkpoint[]
}
export interface ObservableStep {
  id: string
  label: string
  detail: string
  occurredAt: string
  verificationState: VerificationState
  riskLevel: string | null
  evidenceRefs: string[]
}
export interface ReasoningResult {
  kind: 'reasoning_audit'
  steps: ObservableStep[]
  riskNodes: {
    stepId: string
    ruleRef: string
    description: string
    evidenceRefs: string[]
    alertId: string | null
  }[]
  auditResult: string
  activation: {
    modelId: EntityId
    modelVersion: string
    inferenceId: string
    captureId: string
  } | null
}
export interface AbnormalNeuron {
  layer: number
  index: number
  value: number
  concept: string
  evidenceRefs: string[]
}
export interface NeuronResult {
  kind: 'neuron_audit'
  availability: 'available' | 'unavailable'
  unavailableReason: string | null
  modelVersion: string
  inferenceId: string | null
  captureId: string | null
  layerIndices: number[]
  neuronIndices: number[]
  unit: string
  normalizationBaseline: string
  threshold: number
  heatmap: (number | null)[][]
  abnormalNeurons: AbnormalNeuron[]
  observedCount: number
  ratio: number | null
}
export interface AuditSummary {
  id: string
  displayId: string
  capabilityCode: Capability
  subjectRef: SubjectRef
  reviewStatus: 'pending' | 'confirmed' | 'rejected' | 'needs_evidence'
  reviewReason: string
  version: number
}
export interface AuditDetail extends AuditSummary {
  taskId: string
  executionStatus: TaskStatus
  complianceStatus: 'normal' | 'risk' | 'alarm' | null
  adapterVersion: string
  dataOrigin: string
  evidenceRefs: string[]
  result: TrainingResult | ReasoningResult | NeuronResult
  allowedActions: string[]
}
export interface AuditQuery {
  from?: string
  to?: string
  scope?: string
  capabilityCode?: Capability
  subjectType?: string
  subjectId?: EntityId
  versionId?: string
  captureId?: string
  reviewStatus?: string
  page: number
  pageSize: number
}
export interface TraceRecord {
  stage: string
  recordScope: 'provenance' | 'current'
  subjectRef: SubjectRef
  sourceTraceId: string | null
  occurredAt: string
  evidenceRefs: string[]
  verificationState: VerificationState
}
export interface TraceResult {
  currentTraceId: string
  records: TraceRecord[]
  checks: EvidenceCheck[]
  gaps: Gap[]
  auditRef: string | null
  conclusion: string
  complianceStatus: 'normal' | 'risk' | 'alarm' | null
}
export interface AlertQuery {
  page: number
  pageSize: number
  riskLevel?: string
  status?: string
  stage?: string
  subjectType?: string
  subjectId?: EntityId
}
export interface AlertSummary {
  id: string
  displayId: string
  subjectRef: SubjectRef
  description: string
  riskLevel: 'high' | 'medium' | 'low' | 'advisory'
  currentStatus: 'pending' | 'processing' | 'resolved'
  stage: string
}
export interface AlertDetail extends AlertSummary {
  ruleRef: string
  evidenceRefs: string[]
  supplementaryEvidenceRefs: string[]
  assigneeId: string | null
  version: number
  events: { id: string; description: string; actorId: string; occurredAt: string }[]
  allowedActions: string[]
  resolveBlockers: string[]
  traceId: string | null
}
export interface AlertAction {
  expectedVersion: number
  evidenceRefs?: string[]
  reason?: string
  reviewConclusion?: string
}
export interface AuditReview {
  conclusion: 'confirmed' | 'rejected' | 'needs_evidence'
  reason: string
  evidenceRefs: string[]
  expectedVersion: number
}
export interface Evidence {
  id: string
  displayId: string
  sourceModule: string
  subjectRef: SubjectRef
  occurredAt: string
  sourceTraceId: string | null
  versionRef: string | null
  redactedFields: { key: string; label: string; value: string | null; state: VerificationState }[]
  integrityState: VerificationState
  allowedActions: string[]
}
export interface ComplianceTask {
  taskId: string
  status: TaskStatus
  errorMessage?: string
}
export type CompliancePage<T> = PageResult<T>
