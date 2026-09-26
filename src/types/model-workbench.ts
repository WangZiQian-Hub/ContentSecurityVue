import type { TaskStatus } from './index'

export interface ModelVersion {
  version: string
  createdAt: string
  description: string
  taskId: string | null
}
export interface ModelAsset {
  id: string
  name: string
  type: string
  source: 'self' | 'industry' | 'open'
  version: string
  description: string
  creator: string
  updatedAt: string
  dataset: string | null
  versions: ModelVersion[]
}
export interface TrainingTask {
  id: string
  name: string
  description: string
  status: TaskStatus
  progress: number
  modelId: string
  baseVersion: string
  datasetId: string
  datasetVersion: string
  epochs: number
  epoch: number
  learningRate: number
  batchSize: number
  targetVersion: string
  elapsed: string
  updatedAt: string
  loss: number[]
  validationLoss: number[]
  checkpoints: { name: string; epoch: number; loss: number }[]
}
export interface ModelService {
  id: string
  name: string
  modelId: string
  version: string
  type: 'local' | 'external'
  status: 'running' | 'deployed' | 'offline'
  endpoint: string
  checkedAt: string | null
  latencyMs: number | null
  healthy: boolean | null
}
export interface ModelCall {
  id: string
  modelId: string
  version: string
  serviceId: string
  prompt: string
  originalOutput: string
  governedOutput: string
  reason: string
  riskLevel: string
  reconstruction: string | null
  elapsedMs: number
  createdAt: string
  status: TaskStatus
  traceId: string | null
}
export interface ModelAssessment {
  id: string
  modelId: string
  baseline: string
  edited: string
  datasetId: string
  datasetVersion: string
  taskId: string
  knowledge: string
  status: TaskStatus
  riskTotal: number
  riskBefore: number
  riskAfter: number
  targetTotal: number
  targetBefore: number
  targetAfter: number
  generalTotal: number
  generalBefore: number
  generalAfter: number
  retentionTotal: number
  retentionBefore: number
  retentionAfter: number
  samples: { type: string; input: string; before: string; after: string }[]
}
export interface ModelWorkbench {
  models: ModelAsset[]
  training: TrainingTask[]
  services: ModelService[]
  calls: ModelCall[]
  assessment: ModelAssessment | null
  datasets: {
    id: string
    name: string
    version: string
    rowCount: number
    purpose: 'training' | 'evaluation'
  }[]
  changes: { id: string; serviceName: string; description: string; createdAt: string }[]
}
export const modelSources = { self: '自主研发', industry: '行业模型', open: '开源模型' }
export const modelTypes = ['文本分类', '生成式', '多模态', '向量模型', '图像分类']
export const trainingStates = {
  pending: '待启动',
  running: '进行中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
}
export const serviceStates = { running: '运行中', deployed: '已部署', offline: '离线' }
export function percent(numerator: number, denominator: number) {
  return denominator > 0 ? `${((numerator / denominator) * 100).toFixed(1)}%` : '不适用'
}
export function formatModelTime(value: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '暂无记录'
}
