import type { PageResult } from './index'
import type { Batch, Event, TraceTask, Ticket } from './agent-traces'

export type AgentTraceListFilter = 'all' | 'risk' | 'missing_fields'
export interface AgentTraceStatisticsQuery {
  batchId?: string
  snapshotId?: string
  projectionVersion?: string
  language?: string
  listFilter?: AgentTraceListFilter
  page?: number
  pageSize?: number
  include?: string
  optionQ?: string
  optionPage?: number
  optionPageSize?: number
  representation?: 'sample' | 'raw'
  contentCursor?: string
}
export interface AgentTraceScope {
  batchId: string
  snapshotId: string
  projectionVersion: string
  language: string
  schemaVersion?: string
  policyVersion?: string
  createdAt?: string
  sampleCount?: number
}
export interface AgentTraceContext extends AgentTraceScope {
  listFilter: AgentTraceListFilter
  pageSize: number
  sort: string
  filterFingerprint: string
}
export interface AgentTraceAvailability {
  availability: string
  reason?: string | null
  reasonCode?: string | null
}
export interface AgentTraceMetric extends AgentTraceAvailability {
  estimatedSampleCount?: number
  value: number | null
  unit: string
  validSampleCount: number
  eligibleSampleCount: number
  numerator?: number | null
  denominator?: number | null
}
export interface AgentTraceDistribution extends AgentTraceAvailability {
  denominator?: number
  items: { code: string; label: string; count: number | null; ratioPercent: number | null }[]
}
export interface AgentTraceCoverage extends AgentTraceAvailability {
  availableCount: number
  missingCount: number
  invalidCount: number
  notApplicableCount: number
  applicableCount: number
  totalCount: number
  ratePercent: number | null
}
export interface AgentTraceStatisticsSample extends AgentTraceScope {
  ruleFindings?: import('../utils/agent-trace-presentation').RuleFinding[]
  ruleAudit?: { version: string }
  traceId: string
  displayId: string
  sourceId: string
  filename: string
  sourceFormat: string
  testCategory: string
  testCategoryLabel: string
  tokenUsage: {
    estimated?: boolean
    input: number | null
    reasoningRecorded: number | null
    finalOutput: number | null
    totalRecorded: number | null
    normalizationPolicy: string
    availability: string
  }
  eventCount: number | null
  callCount: number | null
  retryCount: number | null
  durationMs: number | null
  taskStatus: string
  auditDecision: string
  missingFields: string[]
  availability: Record<string, string>
  allowedActions: { viewDetail: boolean; copyJson: boolean; exportJson: boolean }
  ingestOrder: number
}
export interface AgentTraceStatisticsPage
  extends PageResult<AgentTraceStatisticsSample>, Partial<AgentTraceAvailability> {
  context: AgentTraceContext
}
export interface AgentTraceStatisticsCharts {
  testCategoryDistribution: AgentTraceDistribution
  tokenComposition: AgentTraceAvailability & {
    mutuallyExclusive: boolean
    normalizedPolicy: string
    compatibleSampleCount: number
    incompatibleSampleCount: number
    totalRecorded: number | null
    components: (AgentTraceDistribution['items'][number] & {
      validSampleCount: number
      eligibleSampleCount: number
    })[]
  }
  toolRanking: AgentTraceAvailability & {
    totalCallCount: number
    toolTypeCount: number
    rankingOrder: string
    items: {
      toolCode: string
      label: string
      count: number
      isOther: boolean
      mergedToolCount?: number
    }[]
  }
  durationDistribution: AgentTraceAvailability & {
    validCount: number
    missingCount: number
    invalidCount: number
    totalCount: number
    unit: string
    quantileMethod: string
    p50Ms: number | null
    p95Ms: number | null
    buckets: {
      code: string
      label: string
      lowerMs: number
      upperMs: number | null
      lowerInclusive: boolean
      upperInclusive: boolean
      count: number
    }[]
  }
  toolResultDistribution: AgentTraceDistribution & {
    totalCallCount: number
    terminalCount: number
    nonTerminalCount: number
    unknownCount: number
  }
  behaviorMatrix: AgentTraceAvailability & {
    rowDimension: string
    unit: string
    overlapAllowed: boolean
    columns: { code: string; label: string }[]
    rows: {
      categoryCode: string
      label: string
      cells: { behaviorCode: string; count: number | null }[]
    }[]
  }
  sourceDistribution: AgentTraceDistribution
  languageDistribution: AgentTraceDistribution
}
export interface AgentTraceStatisticsWorkspace {
  auditSummary?: import('../utils/agent-trace-presentation').RuleAuditSummary
  resolution: string
  resolvedSelection: AgentTraceScope | null
  scope: AgentTraceScope | null
  batchOptions: PageResult<
    Batch & { sampleCount: number; languages: { code: string; count: number }[] }
  >
  languageOptions: { code: string; label: string; count: number }[]
  kpis: Record<
    | 'sampleCount'
    | 'riskSampleCount'
    | 'recordedTokens'
    | 'reasoningOutputRatio'
    | 'toolCallCount'
    | 'toolTypeCount'
    | 'averageSteps'
    | 'taskSuccessRate',
    AgentTraceMetric
  >
  charts: AgentTraceStatisticsCharts
  completeness: {
    source: AgentTraceCoverage
    time: AgentTraceCoverage
    reasoning: AgentTraceCoverage
    requiredFields: string[]
    missingUnionCount: number
    overlapSummary: {
      timeMissingCount: number
      reasoningMissingCount: number
      sourceMissingCount: number
      timeAndReasoningCount: number
    }
  }
  listCounts: Record<AgentTraceListFilter, number>
  listContext: AgentTraceContext
  samplePage: AgentTraceStatisticsPage
  permissions: {
    canViewStatistics: boolean
    canListSamples: boolean
    canViewDetail: boolean
    canViewRaw: boolean
    canCopyJson: boolean
    canExport: boolean
  }
  exportOptions: {
    kinds: { exportKind: string; formats: string[]; availability: string; reason?: string }[]
    contents: { code: string; label: string; availability: string; reason?: string }[]
    requiredContents: string[]
    redactionProfiles: string[]
    defaultScope: string
    maxSelectedTraceIds: number
  }
  moduleAvailability: Record<string, AgentTraceAvailability>
  warnings: { code: string; message: string; panel: string }[]
}
export interface AgentTraceStatisticsDetail extends AgentTraceScope {
  traceId: string
  displayId: string
  summary: AgentTraceStatisticsSample
  audit: AgentTraceAvailability & {
    decision: string
    riskTypes: string[]
    evidenceRefs: string[]
    policyVersion: string
  }
  sampleJson: AgentTraceAvailability & {
    jsonText: string
    isValidJson: boolean
    complete: boolean
    truncated: boolean
    loadedBytes: number
    totalBytes: number
    contentVersion: string
    contentSha256: string
    nextCursor: string | null
    previewScope: {
      isComplete: boolean
      messagesShown: number
      messagesTotal: number | null
      eventsShown: number
      eventsTotal: number | null
      reason?: string
    }
  }
  rawPreview: AgentTraceAvailability & {
    rawText: string
    kind: string
    lineStart: number
    lineEnd: number
    totalLines: number
    truncated: boolean
    nextCursor?: string | null
  }
  mapping: {
    formatCode: string
    formatLabel: string
    mappingVersion: string
    truncated?: boolean
    totalRows?: number
    rows: { sourcePath: string; targetPath: string; description: string; state: string }[]
  }
  sourceRef: { sourceId: string; recordIndex: number; sourcePath: string }
  navigation: {
    previous: AgentTraceNeighbor | null
    next: AgentTraceNeighbor | null
    position: number
    total: number
    page: number
    pageSize: number
    context: AgentTraceContext
  }
  permissions: {
    viewDetail: boolean
    viewRaw: boolean
    copyJson: boolean
    exportJson: boolean
    redactionProfile: string
  }
  contentChunk: {
    text: string
    offsetBytes: number
    nextCursor: string | null
    contentVersion: string
    complete: boolean
  } | null
}
export interface AgentTraceNeighbor {
  traceId: string
  displayId: string
  page: number
}
export interface AgentTraceStatisticsExport {
  capabilityCode: 'agent_trace_export'
  name: string
  input: AgentTraceScope & {
    view: 'statistics'
    exportKind: 'view' | 'package' | 'sample_json'
    format: 'png' | 'zip' | 'json'
    scope: {
      type: 'filtered' | 'sample'
      language: string
      listFilter: AgentTraceListFilter
      traceIds: string[]
    }
    contents: string[]
    redactionProfile: string
    anonymizeIds: boolean
    locale: string
    timezone: string
    uiVersion: string
    uiState?: { listFilter: AgentTraceListFilter; page: number; pageSize: number }
  }
}
export interface AgentTraceStatisticsApi {
  statistics(
    q: AgentTraceStatisticsQuery,
    signal?: AbortSignal,
  ): Promise<AgentTraceStatisticsWorkspace>
  samples(
    batchId: string,
    q: AgentTraceStatisticsQuery,
    signal?: AbortSignal,
  ): Promise<AgentTraceStatisticsPage>
  sample(
    batchId: string,
    traceId: string,
    q: AgentTraceStatisticsQuery,
    signal?: AbortSignal,
  ): Promise<AgentTraceStatisticsDetail>
  export(command: AgentTraceStatisticsExport, key: string, signal?: AbortSignal): Promise<TraceTask>
  task(id: string, signal?: AbortSignal): Promise<TraceTask & { retryAfterMs?: number }>
  ticket(id: string, key: string, signal?: AbortSignal): Promise<Ticket>
  dispose?(): void
}
/** Mock-only bridge to the existing immutable ingestion snapshots. Never sent over HTTP. */
export interface AgentTraceStatisticsSource {
  batch: Batch
  rows: {
    traceId: string
    displayId: string
    sourceId: string
    filename: string
    sourceFormat: string
    language: string
    testCategory: string
    eventCount: number
    callCount: number
    raw: string
    events: Event[]
    paths: string[]
    time: boolean
    usage: boolean
  }[]
}
