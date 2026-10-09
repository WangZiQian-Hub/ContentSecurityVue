import axios from 'axios'
import { isMock } from './request'
import { isGovernanceLlm, llmRequest } from './governance-llm'
import { executeTask } from './task'
import { mapKeys } from '../utils/case'
import {
  scenarioDemoModels,
  scenarioDemoRecord,
  scenarioDemoRecordById,
  scenarioDemoRecords,
  scenarioDemoResult,
} from '../mock/scenario'
import type { PageResult } from '../types'
import type {
  AnalysisRecord,
  ScenarioCode,
  ScenarioMaterial,
  ScenarioModel,
  ScenarioOutcome,
  ScenarioResult,
} from '../types/scenario'

/** 模型模式判定：只有显式开启时才直连 8001，其余情况回落到业务后端统一能力入口。 */
export const useScenarioLlm = () => isGovernanceLlm

/** 演示数据开关。
 *
 * 模型服务未就绪时用它支撑页面演示：演示结果的结构与文档第 4.2 / 4.3 节完全一致，
 * 因此结果区走的是同一条渲染路径，切到真实服务不需要改页面。
 * 同时尊重平台的 VITE_USE_MOCK，演示环境不必再单独配置。
 * 使用演示数据时页面会显示「演示数据」提示，避免被当成真实模型输出。
 */
export const isScenarioDemo = () => isMock || import.meta.env.VITE_SCENARIO_DEMO === 'true'

/** 同步分析要等上游，文档第 11 节给出单次上游超时 120 秒，这里留出余量。 */
const ANALYSIS_TIMEOUT = 180000

export interface ScenarioInput {
  modelId: string
  scenarioCode: ScenarioCode
  content: string
  language: string
  materials?: ScenarioMaterial[]
  /** 仅 cross_cultural 接受。 */
  targetLanguage?: string
}

/** 模型目录：只读，用于填充模型下拉框。
 *
 * 文档第 3.1 节约定返回裸数组 Model[]。如果这里拿到的是分页对象或其他结构，
 * 说明当前地址上并不是模型服务，此时必须报错而不是凑合着用：业务后端的模型条目
 * 用的是数字 id，把它当成 model_id 发出去只会得到 404。
 */
export async function listScenarioModels(): Promise<ScenarioModel[]> {
  if (isScenarioDemo()) return scenarioDemoModels
  const data = await llmRequest<unknown>({ url: '/models' })
  if (!Array.isArray(data))
    throw new Error('模型目录返回的不是模型数组，当前地址可能不是模型服务')
  return data as ScenarioModel[]
}

/** 场景分析历史。注意文档第 298 行：不支持 model_id / service_id / version 筛选。 */
export function listScenarioRecords(params: {
  scenarioCode?: ScenarioCode | ''
  page: number
  pageSize: number
}): Promise<PageResult<AnalysisRecord>> {
  if (isScenarioDemo()) {
    const items = scenarioDemoRecords((params.scenarioCode || 'public_opinion') as ScenarioCode)
    return Promise.resolve({
      items,
      total: items.length,
      page: params.page,
      pageSize: params.pageSize,
      totalPages: 1,
    })
  }
  return llmRequest<PageResult<AnalysisRecord>>({
    url: '/analysis/records',
    params: {
      kind: 'scenario',
      ...(params.scenarioCode ? { scenarioCode: params.scenarioCode } : {}),
      page: params.page,
      pageSize: params.pageSize,
    },
  })
}

export function getScenarioRecord(id: string): Promise<AnalysisRecord> {
  if (isScenarioDemo()) return Promise.resolve(scenarioDemoRecordById(id))
  return llmRequest<AnalysisRecord>({ url: `/analysis/records/${encodeURIComponent(id)}` })
}

/** 文档第 7.3 节：已执行的失败仍会在响应体里带回一条记录。
 *
 * 请求层遇到非 2xx 会抛错，但那条记录里包含记录 ID、失败阶段和已保存的输入，
 * 直接丢掉会让用户既看不到原因也查不到历史，所以这里把它取回来。
 */
function recordFromError(error: unknown): AnalysisRecord | null {
  if (!axios.isAxiosError(error)) return null
  const body = error.response?.data
  if (!body || typeof body !== 'object') return null
  const envelope = mapKeys(body, 'camel') as { data?: unknown }
  const data = envelope.data
  if (!data || typeof data !== 'object') return null
  const candidate = data as Partial<AnalysisRecord>
  return typeof candidate.id === 'string' && typeof candidate.status === 'string'
    ? (candidate as AnalysisRecord)
    : null
}

/** 提交一次场景分析。
 *
 * 模型模式：POST /analysis/scenarios，返回完整结果与保存记录。
 * 业务模式：沿用统一能力入口 POST /tasks/execute，只带回通用任务，
 * 页面据此回退为原始结果展示（文档未定义该路径的分析结果结构）。
 */
export async function runScenario(input: ScenarioInput): Promise<ScenarioOutcome> {
  if (isScenarioDemo()) {
    const record = scenarioDemoRecord(input.scenarioCode, `analysis-demo-${input.scenarioCode}-1`)
    return {
      mode: 'llm',
      result: scenarioDemoResult(input.scenarioCode),
      record: { ...record, modelId: input.modelId, finishedAt: new Date().toISOString() },
    }
  }

  if (!useScenarioLlm()) {
    // 沿用统一能力入口；executeTask 同时负责演示模式下的本地适配。
    // 该路径只返回通用任务，没有分析结果结构，由页面回退为原始结果展示。
    const task = await executeTask({
      capabilityCode: 'scenario_governance',
      name: '场景主动干预',
      input: { scenarioCode: input.scenarioCode, content: input.content },
      timeoutSeconds: ANALYSIS_TIMEOUT / 1000,
    })
    return { mode: 'backend', task }
  }

  // 文档第 4.1 节：该请求不接受其他额外字段，所以按场景条件拼装。
  const data: Record<string, unknown> = {
    modelId: input.modelId,
    scenarioCode: input.scenarioCode,
    content: input.content,
    language: input.language,
  }
  if (input.materials?.length) data.materials = input.materials
  if (input.scenarioCode === 'cross_cultural' && input.targetLanguage)
    data.targetLanguage = input.targetLanguage

  try {
    const record = await llmRequest<AnalysisRecord>({
      url: '/analysis/scenarios',
      method: 'POST',
      data,
      timeout: ANALYSIS_TIMEOUT,
    })
    return { mode: 'llm', result: record.result, record }
  } catch (error) {
    const record = recordFromError(error)
    if (record) return { mode: 'llm', result: record.result as ScenarioResult | null, record }
    throw error
  }
}

/** 目录为空时不应该给出一个空下拉框，由调用方展示可读的提示。 */
export function describeModels(models: ScenarioModel[] | null) {
  if (models === null) return { ready: false, message: '模型目录读取失败，请确认令牌有效后重试。' }
  if (!models.length)
    return { ready: false, message: '模型服务尚未配置可用模型，请联系模型接入同学。' }
  return { ready: true, message: '' }
}
