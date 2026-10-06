import axios, { type AxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import { mapKeys } from '../utils/case'
import type { ApiResponse } from '../types'
export const isMock = import.meta.env.VITE_USE_MOCK !== 'false'
let lastTraceId: string | undefined
const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 30000,
})
client.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('accessToken')
  if (token) config.headers.set('Authorization', `Bearer ${token}`)
  if (lastTraceId) config.headers.set('X-Trace-Id', lastTraceId)
  if (!config.headers.has('X-Request-Id')) config.headers.set('X-Request-Id', crypto.randomUUID())
  config.data = mapKeys(config.data, 'snake')
  config.params = mapKeys(config.params, 'snake')
  return config
})
/** 请求配置：在 axios 配置之上追加前端本地标记（不会随请求发送到后端）。 */
export type RequestConfig = AxiosRequestConfig & {
  /**
   * 为 true 时，请求失败不弹全局提示，由调用方自行用中文说明原因。
   * 用于「数据尚未登记」这类正常数据状态，避免被误认为页面故障。
   */
  silent?: boolean
}
export async function request<T>(config: RequestConfig): Promise<T> {
  try {
    const response = await client.request(config)
    const envelope = mapKeys(response.data, 'camel') as ApiResponse<T>
    lastTraceId = envelope.traceId
    if (envelope.code !== 0) throw new Error(envelope.message || '请求失败')
    return envelope.data
  } catch (error) {
    // AbortController cancellation is an expected lifecycle event (for example,
    // when a page changes while its previous request is still pending). It is
    // still rethrown so callers can stop their loading state, but must not be
    // shown as a user-facing request failure.
    if (axios.isCancel(error)) throw error
    const message = axios.isAxiosError(error)
      ? error.response?.data?.message || error.message
      : error instanceof Error
        ? error.message
        : '网络异常'
    if (!config.silent) ElMessage.error(String(message))
    throw error
  }
}
