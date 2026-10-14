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
/* ── 演示专用：令牌写死在这里，模块加载时即视为“已配置”，打开页面无需任何人手填。
   正式版（用户登录后由后端签发令牌并入库）请删除本段，改为登录成功后调用 saveLlmToken()。
   以后若改用构建注入，只需把 DEMO_LLM_TOKEN 的值换成
   import.meta.env.VITE_LLM_ACCESS_TOKEN?.trim()，其余逻辑不用动。
   注意：此值会出现在前端产物与 git 历史中，演示结束后请让模型服务同学轮换该令牌。── */
const DEMO_LLM_TOKEN = 'qbMA-UZQY912ZKG-MLFhNdzLyclXfgQGiCoRKiv3oaI'
if (DEMO_LLM_TOKEN && !getLlmToken()) saveLlmToken(DEMO_LLM_TOKEN)
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
    await showError(String(message))
    throw error
  }
}
