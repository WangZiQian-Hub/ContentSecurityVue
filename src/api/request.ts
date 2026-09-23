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
export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  try {
    const response = await client.request(config)
    const envelope = mapKeys(response.data, 'camel') as ApiResponse<T>
    lastTraceId = envelope.traceId
    if (envelope.code !== 0) throw new Error(envelope.message || '请求失败')
    return envelope.data
  } catch (error) {
    const message = axios.isAxiosError(error)
      ? error.response?.data?.message || error.message
      : error instanceof Error
        ? error.message
        : '网络异常'
    ElMessage.error(String(message))
    throw error
  }
}
