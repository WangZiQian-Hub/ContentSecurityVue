import { request, isMock } from './request'
import { tasks } from '../mock/data'
import { getTaskCategory } from '../utils/enums'
import type { ExecuteTaskReq, PageResult, Task } from '../types'
export async function listTasks(): Promise<PageResult<Task>> {
  if (isMock)
    return { items: [...tasks], total: tasks.length, page: 1, pageSize: 20, totalPages: 1 }
  return request({ url: '/tasks', params: { page: 1, pageSize: 20 } })
}
export async function executeTask(data: ExecuteTaskReq): Promise<Task> {
  if (isMock) {
    await new Promise((resolve) => setTimeout(resolve, 650))
    const task: Task = {
      taskId: `mock_${crypto.randomUUID()}`,
      name: data.name || '能力演示任务',
      taskCategory: data.taskCategory || getTaskCategory(data.capabilityCode),
      capabilityCode: data.capabilityCode,
      status: 'succeeded',
      createdAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      elapsedMs: 650,
      result: {
        isMock: true,
        summary: '模拟调用完成，后续请接入真实算法服务。',
        input: data.input,
      },
    }
    tasks.unshift(task)
    return task
  }
  return request({
    url: '/tasks/execute',
    method: 'POST',
    data,
    timeout: (data.timeoutSeconds || 300) * 1000,
  })
}
