import axios from 'axios'
import { ElMessage } from 'element-plus'
import { isMock, request, type RequestConfig } from './request'
import {
  createComplianceEventOverview,
  createComplianceEvents,
} from '../mock/compliance-events'
import type {
  ComplianceEvent,
  ComplianceEventOverview,
} from '../types/compliance-event'
import type { PageResult } from '../types'

/** 训练中合规事件监控接口（GN18-19）。
 * 归属业务后端（8000）训练任务域。数据展示策略：
 *   1. isMock=true（VITE_USE_MOCK=true）：直接使用固定样例；
 *   2. isMock=false 且后端接口已就绪：展示后端返回数据；
 *   3. isMock=false 但后端尚未实现（404）：自动回落到固定样例，保证页面可用；
 *   4. 其他错误（500/网络异常）：正常提示并向上抛出。
 *
 * 预留接口（后端待实现）：
 *   GET /api/v1/compliance-events/overview?training_task_id=xxx
 *   GET /api/v1/compliance-events?training_task_id=xxx&page=1&page_size=10
 */

/** 真实请求 + 404 回落。 */
async function withFallback<T>(
  real: RequestConfig,
  fallback: () => T,
): Promise<T> {
  if (isMock) return Promise.resolve(fallback())
  try {
    return await request<T>({ ...real, silent: true })
  } catch (error) {
    // 后端未提供该接口时回落到固定样例，不弹错误提示。
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

/** 读取监控面板概览（汇总 + 最近事件）。 */
export function getComplianceEventOverview(
  trainingTaskId?: string,
): Promise<ComplianceEventOverview> {
  return withFallback<ComplianceEventOverview>(
    {
      url: '/compliance-events/overview',
      params: trainingTaskId ? { trainingTaskId } : {},
    },
    createComplianceEventOverview,
  )
}

/** 分页查询全部合规事件（“查看全部记录”弹窗使用）。 */
export function listComplianceEvents(
  page = 1,
  pageSize = 10,
  trainingTaskId?: string,
): Promise<PageResult<ComplianceEvent>> {
  return withFallback<PageResult<ComplianceEvent>>(
    {
      url: '/compliance-events',
      params: { page, pageSize, ...(trainingTaskId ? { trainingTaskId } : {}) },
    },
    () => {
      const events = createComplianceEvents()
      return {
        items: events.slice((page - 1) * pageSize, page * pageSize),
        total: events.length,
        page,
        pageSize,
        totalPages: Math.ceil(events.length / pageSize),
      }
    },
  )
}
