import { beforeEach, describe, expect, it, vi } from 'vitest'
const backend = vi.hoisted(() => ({ isMock: true, request: vi.fn() }))
vi.mock('./request', () => backend)
import {
  createProcessTask,
  previewProcess,
  getProcessOptions,
  listProcessTasks,
  getProcessTask,
} from './data-governance'
import { PROCESS_KIND } from '../types/data-governance'
import type { ProcessInput } from '../types/data-governance'
const input: ProcessInput = {
  datasetId: 3,
  datasetVersionId: 'dsv_000003',
  scope: 'batch',
  batchId: 'batch_1',
  templateId: 'standard',
  rules: ['normalize_text', 'deduplicate'],
}
describe('数据处理接口契约', () => {
  beforeEach(() => {
    backend.isMock = true
    backend.request.mockReset()
  })
  it('真实查询统一传递 kind 和分页，不回退示例', async () => {
    backend.isMock = false
    await getProcessOptions()
    expect(backend.request).toHaveBeenLastCalledWith({
      url: '/data-governance/options',
      params: { kind: PROCESS_KIND },
    })
    await listProcessTasks(2, 10)
    expect(backend.request).toHaveBeenLastCalledWith({
      url: '/tasks',
      params: { kind: PROCESS_KIND, page: 2, pageSize: 10 },
    })
    backend.request.mockRejectedValue(new Error('offline'))
    await expect(getProcessTask('tsk_1')).rejects.toThrow('offline')
  })
  it('演示模式创建与预览仍请求后端，保留版本和规则顺序', async () => {
    await previewProcess(input)
    expect(backend.request).toHaveBeenLastCalledWith({
      url: '/data-governance/preview',
      method: 'POST',
      data: { kind: PROCESS_KIND, input },
    })
    await createProcessTask(input)
    expect(backend.request).toHaveBeenLastCalledWith({
      url: '/tasks',
      method: 'POST',
      data: { kind: PROCESS_KIND, name: '数据清洗任务', input },
    })
    backend.request.mockRejectedValue(new Error('offline'))
    await expect(createProcessTask(input)).rejects.toThrow('offline')
  })
  it('只读快照分页并保持数据集与输入版本对应', async () => {
    const options = await getProcessOptions()
    const tasks = await listProcessTasks(2, 1)
    expect(tasks.items).toHaveLength(1)
    const task = tasks.items[0]!
    expect(
      options.datasets
        .find((item) => item.id === task.input.datasetId)
        ?.versions.some((item) => item.versionId === task.input.datasetVersionId),
    ).toBe(true)
    expect((await listProcessTasks(5, 10)).items).toEqual([])
    await expect(getProcessTask('demo_missing')).rejects.toThrow('任务不存在')
  })
})
