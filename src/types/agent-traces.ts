import type { PageResult, TaskStatus } from './index'
export type View = 'ingest' | 'statistics' | 'execution' | 'tools'
export interface Query {
  batchId?: string
  snapshotId?: string
  sourceId?: string
  traceId?: string
  eventId?: string
  issueType?: string
  q?: string
  page?: number
  pageSize?: number
  eventPage?: number
  eventTypes?: string
  optionQ?: string
  optionPage?: number
  batchOptionPage?: number
  filesPage?: number
}
export interface Format {
  code: string
  label: string
  containers: string[]
  description: string
  availability: string
  schemaVersion: string
  exampleText: string
}
export interface Batch {
  batchId: string
  displayId: string
  name: string
  batchVersion: number
  activeSnapshotId: string | null
  allowedActions: string[]
  stagingChanged: boolean
}
export interface FileRow {
  fileId: string
  filename: string
  sizeBytes: number
  detectedFormat: string | null
  formatOverride: string
  recognitionState: string
  parseStatus: string
  parsedTraceCount: number
  inputCandidateCount: number | null
  failedRecordCount: number
  errorExamples: { message: string; lineStart: number }[]
}
export interface Sample {
  traceId: string
  displayId: string
  sourceId: string
  filename: string
  sourceFormat: string
  language: string
  testCategory: string
  eventCount: number
  callCount: number
  issueTypes: string[]
}
export interface Event {
  eventId: string
  ordinal: number
  eventType: string
  label: string
  role?: string
  toolName?: string | null
  callId?: string | null
  inputJson?: string | null
  outputJson?: string | null
  durationMs?: number | null
  timestamp?: string | null
}
export interface Locator {
  traceId: string
  sourceId: string
  displayId?: string
  page?: number
}
export interface Detail extends Sample {
  batchId: string
  snapshotId: string
  selectedEventId: string | null
  selectedEventPage?: number
  rawPreview: {
    rawText: string
    kind: string
    truncated: boolean
    lineStart: number
    totalLines: number
  }
  events: PageResult<Event>
  normalizedEvent: Event | null
  sourceRef: { sourcePath: string; recordIndex: number }
  mapping: {
    formatLabel: string
    rows: { sourcePath: string; targetPath: string; description: string; state: string }[]
  }
  navigation: { previous: Locator | null; next: Locator | null }
}
export interface Metric {
  code: string
  passed: number
  eligible: number
  missing: number
  failed: number
  notApplicable: number
  state: string
}
export interface Issue {
  code: string
  severity: string
  affectedTraceCount: number
  impact: string
  examples: Locator[]
}
export interface Workspace {
  resolvedSelection: {
    batchId: string | null
    snapshotId: string | null
    sourceId: string | null
    traceId: string | null
  }
  formats: Format[]
  uploadPolicy: { allowedExtensions: string[]; maxFileBytes: number; maxFilesPerRequest: number }
  sourceOptions: PageResult<{ sourceId: string; filename: string }>
  batchOptions: PageResult<Batch>
  batch: Batch | null
  files: PageResult<FileRow>
  summary: {
    fileCount: number
    supportedFormatCount: number
    importedFormatCount: number
    parsedTraceCount: number
    failedRecordCount: number
    categoryMode: string
    byLanguage: { code: string; count: number }[]
    byCategory: { code: string; label: string; count: number }[]
    byFormat: { code: string; traceCount: number }[]
  }
  validation: { traceTotal: number; metrics: Metric[]; canContinue: boolean; blockers: string[] }
  issues: Issue[]
  samplePage: PageResult<Sample>
  exportOptions: {
    scopes: string[]
    anonymizeRequired: boolean
    contents: { code: string; availability: string; reason?: string }[]
  }
  activeTasks: TraceTask[]
}
export interface Command {
  capabilityCode: 'agent_trace_ingest' | 'agent_trace_export'
  name: string
  input: {
    batchId: string
    expectedVersion?: number
    fileIds?: string[]
    mode?: string
    snapshotId?: string
    exportKind?: string
    format?: string
    view?: View
    selectedTraceId?: string
    selectedEventId?: string
    scope?: {
      type: string
      sourceId: string | null
      traceIds: string[]
      issueType: string | null
      q: string | null
    }
    contents?: string[]
    redactionProfile?: string
    anonymizeIds?: boolean
    locale?: string
    timezone?: string
    uiVersion?: string
  }
}
export interface Artifact {
  artifactId: string
  filename: string
  mimeType: string
  batchId: string
  snapshotId: string
}
export interface TraceTask {
  taskId: string
  status: TaskStatus
  progress?: number
  errorMessage?: string
  result?: {
    kind: string
    batchId: string
    snapshotId: string
    outcome?: string
    artifacts?: Artifact[]
  }
}
export interface Ticket {
  downloadUrl: string
  filename: string
  expiresAt: string
}
export interface AgentTraceApi {
  statisticsSource?(q: Query): import('./agent-trace-statistics').AgentTraceStatisticsSource[]
  workspace(q: Query, signal?: AbortSignal): Promise<Workspace>
  createBatch(name: string, key: string): Promise<Batch>
  upload(file: File, key: string): Promise<{ fileId: string }>
  bind(
    batchId: string,
    expectedVersion: number,
    files: { fileId: string; formatOverride: string }[],
    key: string,
  ): Promise<{ batch: Batch }>
  samples(batchId: string, q: Query, signal?: AbortSignal): Promise<PageResult<Sample>>
  detail(batchId: string, traceId: string, q: Query, signal?: AbortSignal): Promise<Detail>
  execute(command: Command, key: string): Promise<TraceTask>
  task(id: string, signal?: AbortSignal): Promise<TraceTask>
  ticket(id: string, key: string): Promise<Ticket>
  dispose?(): void
}
