import type { TaskStatus } from './index'
export const PROCESS_KIND = 'governance-process'
export interface ProcessInput {
  datasetId: number
  datasetVersionId: string
  scope: 'all' | 'batch' | 'filtered'
  batchId?: string
  filter?: { keyword: string }
  rules: string[]
  templateId: string
}
export interface ProcessOptions {
  datasets: { id: number; name: string; versions: { versionId: string; label: string }[] }[]
  rules: { code: string; label: string; description: string }[]
  templates: { id: string; name: string; rules: string[] }[]
}
export interface ProcessComparison {
  id: string
  original: string
  processed: string
  actions: string[]
  fields: { name: string; before: string; after: string }[]
}
export interface ProcessTask {
  taskId: string
  name: string
  datasetName: string
  input: ProcessInput
  ruleName: string
  outputVersion: string | null
  status: TaskStatus
  progress: number
  processedCount: number
  totalCount: number
  remainingSeconds: number | null
  steps: { name: string; status: TaskStatus }[]
  comparisons: ProcessComparison[]
  createdAt: string
  finishedAt: string | null
  traceId: string
  errorMessage?: string
}
export interface ProcessPreview {
  items: ProcessComparison[]
  sampleCount: number
}
