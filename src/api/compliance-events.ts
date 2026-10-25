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
 *   2. isMock=false：只展示后端返回的数据；
 *   3. 后端尚未实现该接口（404）：抛出带中文说明的错误，由面板显示"接口未提供"，
 *      不再静默回落样例——缺失的数据不得伪装成真实监控结果。
 *
 * 待后端实现的接口：
 *   GET /api/v1/compliance-events/overview?training_task_id=xxx
 *   GET /api/v1/compliance-events?training_task_id=xxx&page=1&page_size=10
 */

/** 真实请求。404 转为明确的"接口未提供"错误；其余错误提示后原样抛出。
 *  全程不弹 404 的全局提示：面板每 5 秒轮询一次，静默交给面板内联告警处理。 */
async function requestEvents<T>(real: RequestConfig): Promise<T> {
  try {
    return await request<T>({ ...real, silent: true })
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      throw new Error('合规事件接口尚未由后端提供（GET /api/v1/compliance-events），监控数据暂不可用。')
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
  if (isMock) return Promise.resolve(createComplianceEventOverview())
  return requestEvents<ComplianceEventOverview>({
    url: '/compliance-events/overview',
    params: trainingTaskId ? { trainingTaskId } : {},
  })
}

/** 分页查询全部合规事件（“查看全部记录”弹窗使用）。 */
export function listComplianceEvents(
  page = 1,
  pageSize = 10,
  trainingTaskId?: string,
): Promise<PageResult<ComplianceEvent>> {
  if (isMock) {
    const events = createComplianceEvents()
    return Promise.resolve({
      items: events.slice((page - 1) * pageSize, page * pageSize),
      total: events.length,
      page,
      pageSize,
      totalPages: Math.ceil(events.length / pageSize),
    })
  }
  return requestEvents<PageResult<ComplianceEvent>>({
    url: '/compliance-events',
    params: { page, pageSize, ...(trainingTaskId ? { trainingTaskId } : {}) },
  })
}
