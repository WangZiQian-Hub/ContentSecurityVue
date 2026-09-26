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
import { processOutputVersionLabel } from '../utils/process-output-version'
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
  it('任务首次完成并生成输出版本后刷新共享版本目录', async () => {
    const store = useDataGovernanceStore()
    store.currentTask = structuredClone(processTasks[0]!)
    const completed = {
      ...structuredClone(processTasks[0]!),
      status: 'succeeded' as const,
      outputVersion: 'server-new-version',
    }
    api.getProcessTask.mockResolvedValue(completed)
    api.getProcessOptions.mockResolvedValue(processOptions)
    await store.refreshCurrentTask()
    expect(api.getProcessOptions).toHaveBeenCalledTimes(1)
    expect(store.options?.datasets).toEqual(processOptions.datasets)
    await store.refreshCurrentTask()
    expect(api.getProcessOptions).toHaveBeenCalledTimes(1)
  })
  it('创建后的最近任务展示用户名称，刷新和完成后仍保留名称及独立版本ID', async () => {
    const store = useDataGovernanceStore()
    const input = { ...structuredClone(processTasks[0]!.input), outputVersionName: '清洗版-v1.1' }
    const created: ProcessTask = {
      ...structuredClone(processTasks[0]!), taskId: 'task-new', input: structuredClone(input),
      status: 'pending', outputVersion: null,
    }
    api.createProcessTask.mockResolvedValue(created)
    await store.createTask(input)
    expect(api.createProcessTask).toHaveBeenCalledWith(input)
    expect(store.tasks[0]?.taskId).toBe('task-new')
    expect(processOutputVersionLabel(store.tasks[0]!)).toBe('清洗版-v1.1')
    expect(store.tasks[0]!.outputVersion).toBeNull()
    input.outputVersionName = '另一个任务版本'
    expect(processOutputVersionLabel(store.tasks[0]!)).toBe('清洗版-v1.1')
    api.listProcessTasks.mockResolvedValue({ items: [structuredClone(created)], total: 1 })
    await store.loadTasks()
    expect(processOutputVersionLabel(store.tasks[0]!)).toBe('清洗版-v1.1')
    api.getProcessTask.mockResolvedValue({ ...created, status: 'succeeded', outputVersion: 'dsv_new_001' })
    api.getProcessOptions.mockResolvedValue(processOptions)
    await store.refreshCurrentTask()
    expect(processOutputVersionLabel(store.tasks[0]!)).toBe('清洗版-v1.1')
    expect(store.tasks[0]!.outputVersion).toBe('dsv_new_001')
    expect(store.total).toBe(1)
  })
  it('历史任务保留原输出版本；创建失败不插入任务或改变旧任务', async () => {
    expect(processOutputVersionLabel(processTasks[1]!)).toBe(processTasks[1]!.outputVersion)
    expect(processOutputVersionLabel(processTasks[0]!)).toBe('—')
    const store = useDataGovernanceStore()
    store.tasks = structuredClone(processTasks)
    store.currentTask = store.tasks[0]
    api.createProcessTask.mockRejectedValue(new Error('版本重名'))
    await expect(store.createTask({ ...processTasks[0]!.input, outputVersionName: 'v1.1' })).rejects.toThrow('版本重名')
    expect(store.tasks).toEqual(processTasks)
    expect(store.currentTask?.taskId).toBe(processTasks[0]!.taskId)
  })
})
