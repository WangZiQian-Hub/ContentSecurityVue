import axios from 'axios'
import { ElMessage } from 'element-plus'
import { isMock } from './request'
import { isGovernanceLlm, llmRequest, llmTokenConfigured } from './governance-llm'
import {
  DEMO_MODEL_ID,
  DEMO_SCOPE,
  createMultilingualResult,
  createMultilingualTask,
  createSamplePage,
  getLatestMultilingualResult,
  getMultilingualTask,
  listMultilingualResults,
} from '../mock/ethnic-multilingual'
import type {
  CreateMultilingualTaskReq,
  MultilingualResult,
  MultilingualSample,
  MultilingualScope,
  MultilingualTask,
} from '../types/ethnic-multilingual'

/** 多语种语义权重与风险分层接口（GN21），归属模型服务（8001）。
 * 路由前缀 /api/v1/analysis/ethnic-multilingual，数据展示策略与合规事件一致：
 *   1. isMock=true（VITE_USE_MOCK=true）：直接使用固定样例；
 *   2. isMock=false 且接口就绪：展示后端返回数据；
 *   3. isMock=false 但接口未实现（404）：静默回落固定样例，页面不报错；
 *   4. 其他错误（401/500/网络）：正常提示并向上抛出。
 */

const BASE = '/analysis/ethnic-multilingual'

/** 真实请求 + 未接入/404 静默回落。
 *  以下情况视为“尚未与模型服务联通”，直接展示固定模拟数据，不报错：
 *    - 全局 mock 开关打开；
 *    - 治理后端不是模型服务；
 *    - 尚未填写访问令牌；
 *    - 接口返回 404（后端尚未实现该端点）。
 *  令牌无效（401/403）、5xx 或网络错误属于真实故障，仍提示并向上抛出。 */
async function withFallback<T>(
  real: Parameters<typeof llmRequest>[0],
  fallback: () => T,
): Promise<T> {
  if (isMock || !isGovernanceLlm || !llmTokenConfigured.value) {
    return fallback()
  }
  try {
    return await llmRequest<T>(real, { silent: true })
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return fallback()
    }
    const message = axios.isAxiosError(error)
      ? error.response?.data?.message || error.message
      : error instanceof Error
        ? error.message
        : '网络异常'
    ElMessage.error(String(message))
    throw error
  }
}

/** 1. 创建分析任务（仅入队，需治理 worker 执行）。 */
export function startMultilingualAnalysis(
  scope: MultilingualScope,
  modelId: string = DEMO_MODEL_ID,
): Promise<MultilingualTask> {
  const body: CreateMultilingualTaskReq = { modelId, input: scope }
  return withFallback<MultilingualTask>(
    { url: `${BASE}/tasks`, method: 'POST', data: body },
    () => createMultilingualTask(modelId, scope),
  )
}

/** 2. 查询任务状态。 */
export function fetchMultilingualTask(taskId: string): Promise<MultilingualTask> {
  return withFallback<MultilingualTask>(
    { url: `${BASE}/tasks/${encodeURIComponent(taskId)}` },
    () => getMultilingualTask(taskId),
  )
}

/** 3. 查询指定结果（汇总）。 */
export function fetchMultilingualResult(resultId: string): Promise<MultilingualResult> {
  return withFallback<MultilingualResult>(
    { url: `${BASE}/results/${encodeURIComponent(resultId)}` },
    () => createMultilingualResult(DEMO_SCOPE),
  )
}

/** 4. 分页查询逐条样本（page_size 最大 200）。 */
export function fetchMultilingualSamples(
  resultId: string,
  page = 1,
  pageSize = 20,
): Promise<{
  items: MultilingualSample[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}> {
  return withFallback(
    {
      url: `${BASE}/results/${encodeURIComponent(resultId)}/samples`,
      params: { page, pageSize },
    },
    () => createSamplePage(page, pageSize),
  )
}

/** 把分析范围序列化为重复的 languages 查询参数
 * （后端要求 languages=zh&languages=en，axios 默认会序列化成 languages[]=，
 *  这里改用 URLSearchParams 显式拼出；拦截器不转换 URLSearchParams）。 */
function scopeQuery(scope: MultilingualScope): URLSearchParams {
  const params = new URLSearchParams()
  params.set('dataset_id', String(scope.datasetId))
  params.set('version_id', scope.versionId)
  for (const language of scope.languages) params.append('languages', language)
  params.set('analysis_mode', scope.analysisMode)
  params.set('scheme_id', scope.schemeId)
  return params
}

/** 5. 查询最近结果（没有结果时后端返回 null）。 */
export function fetchLatestMultilingualResult(
  scope: MultilingualScope,
): Promise<MultilingualResult | null> {
  return withFallback<MultilingualResult | null>(
    { url: `${BASE}/results/latest`, params: scopeQuery(scope) },
    () => getLatestMultilingualResult(),
  )
}

/** 6. 查询历史结果（新→旧，没有结果时后端返回 []）。 */
export function fetchMultilingualResultHistory(
  scope: MultilingualScope,
): Promise<MultilingualResult[]> {
  return withFallback<MultilingualResult[]>(
    { url: `${BASE}/results`, params: scopeQuery(scope) },
    () => listMultilingualResults(),
  )
}
