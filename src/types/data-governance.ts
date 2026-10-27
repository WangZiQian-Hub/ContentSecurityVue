import type { Kpi, TaskStatus } from './index'
export const PROCESS_KIND = 'governance-process'
export interface ProcessKpi extends Kpi {
  // 仅成功率卡片使用；由后端返回实际成功任务数，不能由四舍五入后的百分比反推。
  succeededCount?: number
}
export interface ProcessInput {
  datasetId: number
  datasetVersionId: string
  // 后端按 dataset_versions 清单解析出的人类可读版本号（如 v1.0.0），仅用于展示。
  datasetVersionLabel?: string
  // 用户指定的输出版本名称；旧任务和不生成版本的预览可以没有此字段。
  outputVersionName?: string
  scope: 'all' | 'batch' | 'filtered'
  batchId?: string
  filter?: { keyword: string }
  rules: string[]
  templateId: string
}
export interface ProcessCreateInput extends ProcessInput {
  outputVersionName: string
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
  // 用户填写的输出版本名称（如 v2.0.0），用于展示与重名校验。
  outputVersion: string | null
  // 后端登记的不可变数据版本 ID（dsv_000009），与用户填写的名称分开保存。
  outputVersionId?: string | null
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
