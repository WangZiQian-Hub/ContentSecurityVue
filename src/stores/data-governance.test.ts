import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { processOptions, processTasks } from '../mock/data-governance'
const api = vi.hoisted(() => ({
  getProcessOptions: vi.fn(),
  listProcessTasks: vi.fn(),
  getProcessTask: vi.fn(),
  previewProcess: vi.fn(),
  createProcessTask: vi.fn(),
}))
vi.mock('../api/data-governance', () => api)
import { useDataGovernanceStore } from './data-governance'
import type { ProcessTask } from '../types/data-governance'
describe('数据处理任务状态', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })
  it('历史分页不覆盖首页最近任务', async () => {
    api.listProcessTasks
      .mockResolvedValueOnce({ items: [processTasks[0]], total: 3 })
      .mockResolvedValueOnce({ items: [processTasks[2]], total: 3 })
    const store = useDataGovernanceStore()
    await store.loadTasks()
    await store.loadHistory(2)
    expect(store.tasks[0]?.taskId).toBe(processTasks[0]?.taskId)
    expect(store.history[0]?.taskId).toBe(processTasks[2]?.taskId)
  })
  it('旧任务的慢轮询不会覆盖后来选中的任务', async () => {
    let resolveOld!: (task: ProcessTask) => void
    api.getProcessTask
      .mockImplementationOnce(
        () =>
          new Promise<ProcessTask>((resolve) => {
            resolveOld = resolve
          }),
      )
      .mockResolvedValueOnce(processTasks[1])
    const store = useDataGovernanceStore()
    store.currentTask = structuredClone(processTasks[0]!)
    const polling = store.refreshCurrentTask()
    await store.selectTask(processTasks[1]!.taskId)
    resolveOld(processTasks[0]!)
    await polling
    expect(store.currentTask?.taskId).toBe(processTasks[1]?.taskId)
  })
  it('读取失败后清空上一次页面数据并显示错误', async () => {
    api.getProcessOptions
      .mockResolvedValueOnce(processOptions)
      .mockRejectedValueOnce(new Error('offline'))
    api.listProcessTasks.mockResolvedValue({ items: processTasks, total: 3 })
    const store = useDataGovernanceStore()
    await store.initialize()
    expect(store.currentTask).toBeDefined()
    await store.initialize()
    expect(store.currentTask).toBeUndefined()
    expect(store.options).toBeUndefined()
    expect(store.error).toContain('加载失败')
  })
})
