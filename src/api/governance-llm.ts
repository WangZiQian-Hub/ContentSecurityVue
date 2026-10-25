import axios, { type AxiosRequestConfig } from 'axios'
import { ref } from 'vue'
import { mapKeys } from '../utils/case'

export const LLM_TOKEN_KEY = 'llmAccessToken'
export const isGovernanceLlm = import.meta.env.VITE_GOVERNANCE_BACKEND === 'llm'
let lastTraceId: string | undefined
const client = axios.create({
  baseURL: import.meta.env.VITE_LLM_API_BASE_URL || '/llm-api/v1',
  timeout: 30000,
})

export function getLlmToken() {
  if (typeof sessionStorage === 'undefined') return ''
  return sessionStorage.getItem(LLM_TOKEN_KEY)?.trim() || ''
}
/** 令牌是否已配置。
 *  sessionStorage 本身不是响应式的，而令牌栏现在挂在全局布局里，
 *  需要随令牌变化重新取数的页面（例如场景应用的模型目录）靠这个标记感知。 */
export const llmTokenConfigured = ref(!!getLlmToken())
/** 令牌是否已失效：模型服务返回 401/403 时置位，保存新令牌时复位。
 *  令牌状态胶囊据此标红，提示需要重新填写。 */
export const llmTokenInvalid = ref(false)
/* ── 开发便利：本地令牌由未跟踪的 .env.local 注入（VITE_LLM_ACCESS_TOKEN），
   打开页面无需手填；令牌值不进 git 提交与前端构建产物（.env.local 已被忽略）。
   正式版（用户登录后由后端签发令牌并入库）请删除本段，改为登录成功后调用 saveLlmToken()。
   对外部署/公开演示前请轮换该令牌。── */
const DEV_LLM_TOKEN = import.meta.env.VITE_LLM_ACCESS_TOKEN?.trim() || ''
if (DEV_LLM_TOKEN && !getLlmToken()) saveLlmToken(DEV_LLM_TOKEN)
export function saveLlmToken(token: string) {
  if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(LLM_TOKEN_KEY, token.trim())
  llmTokenConfigured.value = true
  llmTokenInvalid.value = false
}
export function clearLlmToken() {
  if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(LLM_TOKEN_KEY)
  llmTokenConfigured.value = false
}

client.interceptors.request.use((config) => {
  const token = getLlmToken()
  if (token) config.headers.set('Authorization', `Bearer ${token}`)
  if (lastTraceId) config.headers.set('X-Trace-Id', lastTraceId)
  if (!config.headers.has('X-Request-Id')) config.headers.set('X-Request-Id', crypto.randomUUID())
  config.data = mapKeys(config.data, 'snake')
  config.params = mapKeys(config.params, 'snake')
  return config
})

async function showError(message: string) {
  if (typeof document === 'undefined') return
  const { ElMessage } = await import('element-plus')
  ElMessage.error(message)
}

/** 调用选项：silent=true 时除鉴权失效外的错误不弹全局提示，由调用方自行处理。
 *  用于“接口可能尚未实现、需要静默回落模拟数据”的场景。 */
export interface LlmRequestOptions {
  silent?: boolean
}

export async function llmRequest<T>(
  config: AxiosRequestConfig,
  options: LlmRequestOptions = {},
): Promise<T> {
  const token = getLlmToken()
  if (!token) {
    const message = '尚未填写模型服务访问令牌，请先填写令牌后重试。'
    if (!options.silent) await showError(message)
    throw new Error(message)
  }
  try {
    const response = await client.request(config)
    const envelope = mapKeys(response.data, 'camel') as {
      code: number
      message?: string
      data: T
      traceId?: string
    }
    lastTraceId = envelope.traceId
    if (envelope.code !== 0) throw new Error(envelope.message || '请求失败')
    return envelope.data
  } catch (error) {
    if (axios.isCancel(error)) throw error
    const status = axios.isAxiosError(error) ? error.response?.status : undefined
    if (status === 401 || status === 403) {
      llmTokenInvalid.value = true
      const message = '模型服务访问令牌无效或已失效，请重新填写。'
      await showError(message)
      throw new Error(message)
    }
    const message = axios.isAxiosError(error)
      ? error.response?.data?.message || error.message
      : error instanceof Error
        ? error.message
        : '网络异常'
    if (!options.silent) await showError(String(message))
    throw error
  }
}
