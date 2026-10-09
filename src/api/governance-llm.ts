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
export function saveLlmToken(token: string) {
  if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(LLM_TOKEN_KEY, token.trim())
  llmTokenConfigured.value = true
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

export async function llmRequest<T>(config: AxiosRequestConfig): Promise<T> {
  const token = getLlmToken()
  if (!token) {
    const message = '尚未填写模型服务访问令牌，请先填写令牌后重试。'
    await showError(message)
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
      const message = '模型服务访问令牌无效或已失效，请重新填写。'
      await showError(message)
      throw new Error(message)
    }
    const message = axios.isAxiosError(error)
      ? error.response?.data?.message || error.message
      : error instanceof Error
        ? error.message
        : '网络异常'
    await showError(String(message))
    throw error
  }
}
