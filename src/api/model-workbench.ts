import { isMock, request } from './request'
import { llmRequest } from './governance-llm'
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

