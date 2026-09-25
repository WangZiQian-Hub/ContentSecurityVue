import { getResourceSamples } from './data-resource'
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
  const result = await request<PageResult<ProcessTask>>({
    url: '/tasks',
    params: { kind: PROCESS_KIND, page, pageSize },
  })
  result.items = await Promise.all(
    result.items.map(async (task) => ({
      ...task,
      comparisons: await resolveComparisons(task.input, task.comparisons),
    })),
  )
  return result
}
export async function getProcessTask(taskId: string): Promise<ProcessTask> {
  if (isMock && taskId.startsWith('demo_')) {
    const task = processTasks.find((item) => item.taskId === taskId)
    if (!task) throw new Error('任务不存在')
    return structuredClone(task)
  }
  const task = await request<ProcessTask>({
    url: `/tasks/${encodeURIComponent(taskId)}`,
    params: { kind: PROCESS_KIND },
  })
  task.comparisons = await resolveComparisons(task.input, task.comparisons)
  return task
}
// 写入与预览始终请求后端，不伪造清洗结果、任务记录或版本。
export async function previewProcess(input: ProcessInput): Promise<ProcessPreview> {
  const preview = await request<ProcessPreview>({
    url: '/data-governance/preview',
    method: 'POST',
    data: { kind: PROCESS_KIND, input },
  })
  if (preview) preview.items = await resolveComparisons(input, preview.items)
  return preview
}
export function createProcessTask(input: ProcessInput): Promise<ProcessTask> {
  return request({
    url: '/tasks',
    method: 'POST',
    data: { kind: PROCESS_KIND, name: '数据清洗任务', input },
  })
}

async function resolveComparisons(input: ProcessInput, rows: ProcessTask['comparisons']) {
  if (!rows.length) return rows
  const samples = await getResourceSamples(
    input.datasetId,
    input.datasetVersionId,
    rows.map((row) => row.id),
  )
  return rows.map((row) => {
    const sample = samples.find(
      (item) =>
        item.id === row.id &&
        item.datasetId === input.datasetId &&
        item.versionId === input.datasetVersionId,
    )
    if (!sample || sample.text !== row.original) throw new Error('清洗样本与数据资源版本不一致')
    return { ...row, id: sample.id, original: sample.text }
  })
}
