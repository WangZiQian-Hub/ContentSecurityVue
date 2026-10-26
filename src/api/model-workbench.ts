import { isMock, request } from './request'
import { getLlmToken, llmRequest } from './governance-llm'
import type { ExecuteTaskReq, Task, PageResult } from '../types'
import type {
  ModelWorkbench,
  ModelAsset,
  ModelAssessment,
  TrainingTask,
  ModelService,
} from '../types/model-workbench'

// 聚合读取及训练、服务动作属于本模块新增契约，见 docs/model-workbench.md。
type ModelRecord = Omit<ModelAsset, 'type' | 'source' | 'id'> & {
  id: string | number
  modelType: string
  source: 'self_developed' | 'industry' | 'open_source'
}
const wireTypes: Record<string, string> = {
  文本分类: 'text_classification',
  生成式: 'generative',
  多模态: 'multimodal',
  向量模型: 'embedding',
  图像分类: 'image_classification',
}
const wireSources = { self: 'self_developed', industry: 'industry', open: 'open_source' } as const
function normalizeModel(record: ModelRecord): ModelAsset {
  return {
    ...record,
    id: String(record.id),
    type: Object.keys(wireTypes).find((k) => wireTypes[k] === record.modelType) || record.modelType,
    source:
      record.source === 'self_developed'
        ? 'self'
        : record.source === 'open_source'
          ? 'open'
          : 'industry',
  }
}
export async function getModelWorkbench(): Promise<ModelWorkbench> {
  const data = await request<Omit<ModelWorkbench, 'models'> & { models: ModelRecord[] }>({
    url: '/model-workbenches/current',
  })
  return { ...data, models: data.models.map(normalizeModel) }
}
/** 查询“模型+基线+编辑后+测试集”组合的最新评估结果；无结果为 null。 */
export function getModelAssessment(input: {
  modelId: string
  baseline: string
  edited: string
  datasetId: string
  datasetVersion: string
}): Promise<ModelAssessment | null> {
  if (isMock) return Promise.resolve(null)
  return request<ModelAssessment | null>({
    url: '/model-workbenches/assessment',
    params: input,
    silent: true,
  })
}
export async function registerModel(
  data: Pick<ModelAsset, 'name' | 'type' | 'source' | 'version' | 'description'>,
): Promise<ModelAsset> {
  const result = await request<ModelRecord>({
    url: '/models',
    method: 'POST',
    data: {
      name: data.name,
      modelType: wireTypes[data.type],
      source: wireSources[data.source],
      version: data.version,
      description: data.description || "",
      status: 'pending',
      serviceUrl: null,
    },
  })
  return normalizeModel(result)
}
export function createTraining(data: Partial<TrainingTask>): Promise<TrainingTask> {
  return request({ url: '/training-tasks', method: 'POST', data })
}
export function registerModelService(
  data: Pick<ModelService, 'name' | 'modelId' | 'version' | 'type' | 'endpoint'>,
): Promise<ModelService> {
  return request({ url: '/model-services', method: 'POST', data })
}
export function checkModelService(id: string): Promise<ModelService> {
  return request({ url: `/model-services/${encodeURIComponent(id)}/check`, method: 'POST' })
}
export function upgradeModelService(id: string, version: string): Promise<ModelService> {
  return request({ url: `/model-services/${encodeURIComponent(id)}`, method: 'PATCH', data: { version } })
}
export function stopModelService(id: string): Promise<ModelService> {
  return request({ url: `/model-services/${encodeURIComponent(id)}/stop`, method: 'POST' })
}
export function deleteModelService(id: string): Promise<{ id: string; name: string }> {
  return request({ url: `/model-services/${encodeURIComponent(id)}`, method: 'DELETE' })
}
export function executeModelTask(data: ExecuteTaskReq): Promise<Task> {
  if (isMock) throw new Error('演示任务由模型工作台本地适配器处理')
  return request({ url: '/tasks/execute', method: 'POST', data, timeout: 300000 })
}
export async function executeComparison(input: {
  modelId: string
  baseline: string
  edited: string
  datasetId: string
  datasetVersion: string
}): Promise<Task> {
  const metrics = await request<PageResult<{ metricCode: string; status: string }>>({
    url: '/metrics',
    params: { category: 'model_capability', status: 'enabled', page: 1, pageSize: 100 },
  })
  if (!metrics.items.length || metrics.items.some((m) => !m.metricCode))
    throw new Error('指标库尚未配置模型安全评估指标')
  return executeModelTask({
    capabilityCode: 'evaluation',
    name: '模型版本安全效果评估',
    input: {
      modelId: input.modelId,
      datasetId: input.datasetId,
      metricCodes: metrics.items.map((m) => m.metricCode),
    },
    config: {
      baselineVersion: input.baseline,
      editedVersion: input.edited,
      datasetVersion: input.datasetVersion,
    },
  })
}

/** 模型服务（8001）真实模型目录条目。 */
export interface RealModel {
  id: string
  name: string
}

export async function listRealModels(): Promise<RealModel[]> {
  const rows = await llmRequest<{ modelId?: string; id?: string; name?: string }[]>({ url: '/models' })
  return Array.isArray(rows)
    ? rows.map((row) => ({ id: String(row.modelId ?? row.id ?? ''), name: String(row.name ?? '') }))
    : []
}

export interface RealInvokeOutcome {
  originalOutput: string
  governedOutput: string
  reason: string
  riskLevel: string
  reconstruction: string | null
  elapsedMs: number
}

/** 真实调用：由模型服务按 model_risk_governance 结构化契约生成并治理输出。 */
export async function realModelInvoke(
  llmModelId: string,
  prompt: string,
): Promise<RealInvokeOutcome> {
  const startedAt = performance.now()
  const data = await llmRequest<{ result: Record<string, unknown> }>({
    url: '/llm/invoke',
    method: 'POST',
    timeout: 180000,
    data: { modelId: llmModelId, input: prompt, responseType: 'model_risk_governance' },
  })
  const result = (data && data.result) || {}
  return {
    originalOutput: String(result.originalOutput ?? ''),
    governedOutput: String(result.governedOutput ?? ''),
    reason: String(result.reason ?? ''),
    riskLevel: String(result.riskLevel ?? 'unknown'),
    reconstruction: typeof result.reconstruction === 'string' ? result.reconstruction : null,
    elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
  }
}

/** 真实调用成功后把留痕回写业务后端 model_calls（风险命中同时生成合规事件）。 */
export function recordModelCall(data: Record<string, unknown>): Promise<{ id: string }> {
  return request<{ id: string }>({ url: '/model-calls', method: 'POST', data })
}

/** 真实训练：业务后端代理 8001 建单并登记同款台账（令牌透传，任务按令牌隔离）。 */
export function createRealTraining(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>({
    url: '/training-tasks/real',
    method: 'POST',
    data,
    headers: { Authorization: 'Bearer ' + (getLlmToken() || '') },
  })
}

/** 把模型服务的真实训练进度同步进业务台账（轮次/检查点/终态生成合规事件）。 */
export function syncRealTraining(taskId: string, data: Record<string, unknown>) {
  return request({
    url: `/training-tasks/${encodeURIComponent(taskId)}/sync`,
    method: 'POST',
    data,
  })
}

export function fetchRealTrainingTask(taskId: string): Promise<Record<string, unknown>> {
  // 台账只读代理：由 8000 用服务端令牌转发模型服务，浏览器不再持有/依赖模型服务令牌。
  return request<Record<string, unknown>>({
    url: `/training-tasks/${encodeURIComponent(taskId)}/detail`,
  })
}

export interface MetricEvent {
  id: number
  phase?: string | null
  epoch?: number | null
  step?: number | null
  metrics: Record<string, number>
}

export function fetchRealTrainingMetrics(
  taskId: string,
  afterId: number,
): Promise<{ items: MetricEvent[]; nextAfterId: number; hasMore: boolean }> {
  return request({
    url: `/training-tasks/${encodeURIComponent(taskId)}/metrics`,
    params: { afterId, limit: 1000 },
  })
}

export interface RealArtifact {
  id: string
  filename: string
  kind: string
  size: number
  sha256: string
  epoch?: number | null
  loss?: number | null
}

export function listRealArtifacts(taskId: string): Promise<RealArtifact[]> {
  return request<RealArtifact[]>({
    url: `/training-tasks/${encodeURIComponent(taskId)}/artifacts`,
  })
}

/** 产物下载需要原始字节流，绕开信封解析；走 8000 只读代理，携带平台登录令牌即可。 */
export async function downloadRealArtifact(
  taskId: string,
  artifactId: string,
  filename: string,
): Promise<void> {
  const response = await fetch(
    `/api/v1/training-tasks/${encodeURIComponent(taskId)}/artifacts/${encodeURIComponent(artifactId)}/download`,
    { headers: { Authorization: 'Bearer ' + (sessionStorage.getItem('accessToken') || '') } },
  )
  if (!response.ok) throw new Error(`产物下载失败（HTTP ${response.status}）`)
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename.split('/').pop() || 'artifact'
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

