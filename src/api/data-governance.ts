import { isMock, request } from './request'
import { processOptions, processTasks } from '../mock/data-governance'
import { PROCESS_KIND } from '../types/data-governance'
import type {
  ProcessInput,
  ProcessOptions,
  ProcessPreview,
  ProcessTask,
} from '../types/data-governance'
import type { PageResult } from '../types'
export async function getProcessOptions(): Promise<ProcessOptions> {
  if (isMock) return structuredClone(processOptions)
  return request({ url: '/data-governance/options', params: { kind: PROCESS_KIND } })
}
export async function listProcessTasks(page = 1, pageSize = 3): Promise<PageResult<ProcessTask>> {
  if (isMock)
    return {
      items: structuredClone(processTasks.slice((page - 1) * pageSize, page * pageSize)),
      total: processTasks.length,
      page,
      pageSize,
      totalPages: Math.ceil(processTasks.length / pageSize),
    }
  return request({ url: '/tasks', params: { kind: PROCESS_KIND, page, pageSize } })
}
export async function getProcessTask(taskId: string): Promise<ProcessTask> {
  if (isMock && taskId.startsWith('demo_')) {
    const task = processTasks.find((item) => item.taskId === taskId)
    if (!task) throw new Error('任务不存在')
    return structuredClone(task)
  }
  return request({ url: `/tasks/${encodeURIComponent(taskId)}`, params: { kind: PROCESS_KIND } })
}
// 写入与预览始终请求后端，不伪造清洗结果、任务记录或版本。
export function previewProcess(input: ProcessInput): Promise<ProcessPreview> {
  return request({
    url: '/data-governance/preview',
    method: 'POST',
    data: { kind: PROCESS_KIND, input },
  })
}
export function createProcessTask(input: ProcessInput): Promise<ProcessTask> {
  return request({
    url: '/tasks',
    method: 'POST',
    data: { kind: PROCESS_KIND, name: '数据清洗任务', input },
  })
}
