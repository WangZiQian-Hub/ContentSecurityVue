import { createRenderer, nextTick, ssrContextKey } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ValueResult,
  ValueScope,
  ValueSample,
  ValueTask,
  ValueSampleQuery,
} from '../../types/data-value'
const api = vi.hoisted(() => ({
  getValueOptions: vi.fn(),
  getLatestValueResult: vi.fn(),
  getValueResult: vi.fn(),
  listValueSamples: vi.fn(),
  listValueTasks: vi.fn(),
  createValueTask: vi.fn(),
  getValueTask: vi.fn(),
}))
vi.mock('../../api/data-value', () => api)
vi.mock('../../api/request', () => ({ isMock: false }))
vi.mock('./components/ValueChart.vue', () => ({ default: { render: () => null } }))
vi.mock('./components/ValueMetrics.vue', () => ({ default: { render: () => null } }))
vi.mock('../../components/PanelCard.vue', () => ({ default: { render: () => null } }))
import DataValuePage from './DataValuePage.vue'
import { latestDemoResult, valueOptions } from '../../mock/data-value'

// Exercise the actual page setup/watchers with Vue's renderer, without a browser DOM.
interface Host {
  text?: string
}
const renderer = createRenderer<Host, Host>({
  patchProp() {},
  insert() {},
  remove() {},
  createElement: () => ({}),
  createText: (text) => ({ text }),
  createComment: () => ({}),
  setText(node, text) {
    node.text = text
  },
  setElementText(node, text) {
    node.text = text
  },
  parentNode: () => null,
  nextSibling: () => null,
})
interface State {
  scope: ValueScope
  result?: ValueResult | null
  rows: ValueSample[]
  resultFailed: boolean
  loading: boolean
  detailOpen: boolean
  selected?: ValueSample
  explain(row: ValueSample): void
  analyze(): Promise<void>
  refreshTask(task: ValueTask): Promise<void>
  tasks: ValueTask[]
  query: ValueSampleQuery
  total: number
  changeSort(sort: { prop: string; order: 'ascending' | 'descending' | null }): void
}
const flush = async () => {
  for (let i = 0; i < 8; i++) await nextTick()
}
const sample: ValueSample = {
  id: 'sample_3_00001',
  text: '原文',
  language: '中文',
  score: 80,
  tier: 'medium',
  dimensions: [{ name: '文化价值', score: 80, reason: '已保存理由', evidence: ['原文'] }],
}
function mount() {
  const app = renderer.createApp(DataValuePage)
  app.provide(ssrContextKey, {})
  app.config.warnHandler = () => {}
  const vm = app.mount({})
  const state = (vm.$ as unknown as { setupState: State }).setupState
  return { state, unmount: () => app.unmount() }
}
describe('价值页范围切换与只读解释', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.getValueOptions.mockResolvedValue(valueOptions)
    api.getLatestValueResult.mockImplementation(async (scope) => latestDemoResult(scope))
    api.listValueSamples.mockResolvedValue({ items: [sample], total: 1 })
  })
  it('翻页请求期间保留总页数，第二页返回后页码与行数据保持一致', async () => {
    api.listValueSamples.mockResolvedValueOnce({ items: [sample], total: 50 })
    const { state, unmount } = mount()
    await flush()
    let resolvePage!: (value: { items: ValueSample[]; total: number }) => void
    api.listValueSamples.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePage = resolve
        }),
    )
    state.query.page = 2
    await flush()
    expect(state.total).toBe(50)
    expect(state.query.page).toBe(2)
    expect(api.listValueSamples.mock.lastCall?.[1].page).toBe(2)
    const next = { ...sample, id: 'sample_3_00011' }
    resolvePage({ items: [next], total: 50 })
    await flush()
    expect(state.query.page).toBe(2)
    expect(state.rows).toEqual([next])
    state.changeSort({ prop: 'score', order: 'descending' })
    await flush()
    expect(state.query.page).toBe(1)
    expect(api.listValueSamples.mock.lastCall?.[1]).toMatchObject({
      page: 1,
      sortBy: 'score',
      sortOrder: 'desc',
    })
    state.query.page = 2
    await flush()
    expect(api.listValueSamples.mock.lastCall?.[1]).toMatchObject({
      page: 2,
      sortBy: 'score',
      sortOrder: 'desc',
    })
    state.changeSort({ prop: 'tier', order: 'ascending' })
    await flush()
    expect(api.listValueSamples.mock.lastCall?.[1]).toMatchObject({
      page: 1,
      sortBy: 'tier',
      sortOrder: 'asc',
    })
    state.changeSort({ prop: 'tier', order: null })
    await flush()
    expect(state.query.sortBy).toBeUndefined()
    expect(state.query.sortOrder).toBeUndefined()
    unmount()
  })
  it('初始查询历史；切换无结果的范围立即清空旧图表与列表', async () => {
    const { state, unmount } = mount()
    await flush()
    expect(state.result?.scope.language).toBe('zh')
    expect(state.rows).toEqual([sample])
    expect(api.listValueSamples.mock.calls[0]?.[0]).toBe(state.result?.id)
    state.scope.language = 'en'
    await flush()
    expect(state.result).toBeNull()
    expect(state.rows).toEqual([])
    expect(state.selected).toBeUndefined()
    expect(api.createValueTask).not.toHaveBeenCalled()
    unmount()
  })
  it('快速切换时迟到的旧范围响应不能覆盖新范围', async () => {
    const { state, unmount } = mount()
    await flush()
    let resolveOld!: (value: ValueResult | null) => void
    api.getLatestValueResult.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve
        }),
    )
    state.scope.language = 'all'
    await flush()
    const oldScope = { ...state.scope }
    expect(state.result).toBeUndefined()
    expect(state.rows).toEqual([])
    state.scope.language = 'en'
    await flush()
    resolveOld(latestDemoResult(oldScope))
    await flush()
    expect(state.result).toBeNull()
    expect(state.loading).toBe(false)
    unmount()
  })
  it('查询失败与范围不匹配均不保留上个结果', async () => {
    const { state, unmount } = mount()
    await flush()
    const previous = state.result
    api.getLatestValueResult.mockRejectedValueOnce(new Error('offline'))
    state.scope.language = 'en'
    await flush()
    expect(state.resultFailed).toBe(true)
    expect(state.result).toBeUndefined()
    api.getLatestValueResult.mockResolvedValueOnce(previous)
    state.scope.language = 'ja'
    await flush()
    expect(state.resultFailed).toBe(true)
    expect(state.result).toBeUndefined()
    unmount()
  })
  it('解释直接展示已保存样本；只有主动分析才创建任务', async () => {
    const { state, unmount } = mount()
    await flush()
    const row: ValueSample = {
      id: 'resource-id',
      text: '原文',
      language: '中文',
      score: 80,
      tier: 'medium',
      dimensions: [{ name: '文化价值', score: 80, reason: '已保存理由', evidence: ['原文'] }],
    }
    const calls = api.getLatestValueResult.mock.calls.length
    state.explain(row)
    expect(state.detailOpen).toBe(true)
    expect(state.selected).toEqual(row)
    expect(api.getLatestValueResult).toHaveBeenCalledTimes(calls)
    expect(api.createValueTask).not.toHaveBeenCalled()
    api.createValueTask.mockResolvedValue({ taskId: 'task', status: 'pending', resultId: null })
    // Element Plus toast needs a DOM; stub it below.
    await state.analyze()
    expect(api.createValueTask).toHaveBeenCalledExactlyOnceWith({ ...state.scope })
    unmount()
  })
  it('旧范围的明细迟到也不会填回空范围', async () => {
    let resolveRows!: (value: { items: ValueSample[]; total: number }) => void
    api.listValueSamples.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRows = resolve
        }),
    )
    const { state, unmount } = mount()
    await flush()
    state.scope.language = 'en'
    await flush()
    resolveRows({ items: [sample], total: 1 })
    await flush()
    expect(state.result).toBeNull()
    expect(state.rows).toEqual([])
    unmount()
  })
  it('运行与失败状态保留历史快照，任务完成才读取新结果', async () => {
    const { state, unmount } = mount()
    await flush()
    const result = state.result!
    const task: ValueTask = {
      taskId: 'task',
      name: '分析',
      createdAt: '2026-09-25',
      status: 'running',
      resultId: null,
    }
    state.tasks = [task]
    api.getValueTask.mockResolvedValueOnce(task)
    await state.refreshTask(task)
    expect(api.getValueResult).not.toHaveBeenCalled()
    expect(state.result).toEqual(result)
    api.getValueTask.mockResolvedValueOnce({
      ...task,
      status: 'failed',
      errorMessage: '模型输出不合法',
    })
    await state.refreshTask(task)
    expect(state.tasks[0]?.status).toBe('failed')
    expect(state.result).toEqual(result)
    api.getValueTask.mockResolvedValueOnce({ ...task, status: 'succeeded', resultId: 'new-result' })
    api.getValueResult.mockResolvedValueOnce({ ...result, id: 'new-result' })
    await state.refreshTask(task)
    expect(state.result?.id).toBe('new-result')
    expect(api.listValueSamples.mock.lastCall?.[0]).toBe('new-result')
    unmount()
  })
})
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), info: vi.fn() } }))
