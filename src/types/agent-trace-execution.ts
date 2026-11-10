import type { PageResult } from './index'
export interface ExecutionScope {
  batchId: string
  snapshotId: string
  projectionVersion: string
  permissionsVersion: string
}
export interface ExecutionSample {
  traceId: string
  displayId: string
  language: string
  riskLevel: string
  auditDecision: string
  riskTypes: { code: string; label: string }[]
  eventCount: number
  callCount: number
  durationMs: number | null
}
export interface ExecutionQuery {
  traceId?: string
  batchId?: string
  snapshotId?: string
  projectionVersion?: string
  include?: 'options' | 'dashboard'
  q?: string
  language?: string
  riskLevel?: string
  auditDecision?: string
  page?: number
  pageSize?: number
  eventId?: string
  eventPage?: number
  eventPageSize?: number
  section?: 'overview' | 'events' | 'selection' | 'graph'
  redactionMode?: 'raw' | 'redacted'
  graphCursor?: string
  patternPage?: number
}
export interface ExecutionText {
  text: string
  highlights: { start: number; end: number }[]
  truncated?: boolean
  provenance?: string
}
export interface ExecutionSelection {
  eventId: string
  displayId: string
  ordinal: number
  previousEventId: string | null
  nextEventId: string | null
  content: { sourceExcerpt: ExecutionText; reasoningSummary: ExecutionText }
  riskEvidence: {
    items: {
      evidenceId: string
      riskType: { code: string; label: string }
      matchPattern: string
      severity: string
      ruleId: string
      reviewStatus: string
      confidence: number | null
      relatedCallIds: string[]
    }[]
  }
  lineage: { nodes: { id: string; label: string; eventId: string | null }[] }
}
export interface ExecutionEvent {
  eventId: string
  displayId: string
  ordinal: number
  eventType: string
  label: string
  description: string
  evidenceSummary?: string
  relativeTimeMs: number | null
  riskLevel: string
  selectionPreview: ExecutionSelection
}
export interface ExecutionGraph {
  nodes: { eventId: string; displayId: string; ordinal: number; label: string; riskLevel: string }[]
  edges: { edgeId: string; fromEventId: string; toEventId: string; relation: string }[]
  totalNodes: number
  complete: boolean
  nextCursor: string | null
}
export interface ExecutionDetail {
  ruleFindings?: import('../utils/agent-trace-presentation').RuleFinding[]
  ruleAudit?: { version: string }
  scope: ExecutionScope
  traceId: string
  summary: ExecutionSample
  graph: ExecutionGraph
  events: PageResult<ExecutionEvent>
  selection: ExecutionSelection | null
  firstRiskEventId: string | null
  riskDistribution: { items: { code: string; label: string; eventCount: number }[] }
  dangerPatterns: PageResult<{
    patternId: string
    label: string
    eventId: string
    eventDisplayId: string
    snippet: string
  }>
  permissions: { canViewRaw: boolean; canExport: boolean }
}
export interface ExecutionWorkspace {
  activeSnapshotId?: string
  scope: ExecutionScope | null
  batchOptions: PageResult<{ batchId: string; displayId: string; name?: string }>
  batchSummary: { sampleCount: number; byLanguage: { code: string; count: number }[] }
  queriedAt: string
  samplePage: PageResult<ExecutionSample>
  selectedTraceId: string | null
  permissions: { canExport: boolean; canQuery: boolean }
}
