import { createRenderer, nextTick, ssrContextKey } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Query, Result, Sample, Scope } from '../../types/data-risk'
const api = vi.hoisted(() => ({
  getRiskOptions: vi.fn(),
  getLatestRisk: vi.fn(),
  getRiskResult: vi.fn(),
  getRiskTask: vi.fn(),
  listRiskSamples: vi.fn(),
  getRiskSample: vi.fn(),
  searchRiskKnowledge: vi.fn(),
  startRisk: vi.fn(),
}))
vi.mock('../../api/data-risk', () => api)
vi.mock('../../api/request', () => ({ isMock: true }))
vi.mock('../../api/governance-llm', () => ({ isGovernanceLlm: false }))
vi.mock('../../components/PanelCard.vue', () => ({ default: { render: () => null } }))
import Page from './DataRiskPage.vue'
import { riskMock } from '../../mock/data-risk'
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
  setText(n, t) {
    n.text = t
  },
  setElementText(n, t) {
    n.text = t
  },
  parentNode: () => null,
  nextSibling: () => null,
})
interface State {
  scope: Scope
  query: Query
  result: Result | null
  selected?: Sample
  rows: Sample[]
  total: number
  drawer: string
  error: string
  runIssue: string
  runLocked: boolean
  runMessage: string
  loadScope(): Promise<void>
  loadRows(): Promise<void>
  choose(row: Sample): Promise<void>
  filter(level: string, status?: string, candidatesOnly?: boolean): void
  sampleLevel(sample: Sample): string
  openReview(): void
  start(): Promise<void>
  useHistory(result: Result): Promise<void>
}
const flush = async () => {
  for (let i = 0; i < 20; i++) await nextTick()
}
function mount() {
  const app = renderer.createApp(Page)
  app.provide(ssrContextKey, {})
  app.config.warnHandler = () => {}
  const vm = app.mount({})
  return {
    state: (vm.$ as unknown as { setupState: State }).setupState,
    unmount: () => app.unmount(),
  }
}
describe('风险页条件隔离、筛选及证据联动', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    const storage = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: storage.get.bind(storage),
      setItem: storage.set.bind(storage),
      removeItem: storage.delete.bind(storage),
    })
    api.getRiskOptions.mockResolvedValue(riskMock.options())
    api.getLatestRisk.mockImplementation(async (s) => riskMock.latest(s))
    api.listRiskSamples.mockImplementation(async (id, q) => riskMock.samples(id, q))
    api.getRiskSample.mockImplementation(async (id, sample) => riskMock.detail(id, sample))
  })
  afterEach(() => vi.unstubAllGlobals())
  it('默认只查风险候选，查看全部明细时区分提示、未检出风险和无法判断', async () => {
    const { state, unmount } = mount()
    try {
      await flush()
      expect(api.listRiskSamples.mock.lastCall?.[1].candidatesOnly).toBe(true)
      const notice = state.rows.find((row) => row.maximumSuggestedLevel === 'NOTICE')!
      const clear = { ...notice, id: 'clear', findings: [], primaryCategory: '' }
      const unknown = { ...clear, id: 'unknown', status: '无法评估' }
      api.listRiskSamples.mockResolvedValueOnce({ items: [notice, clear, unknown], total: 3 })
      state.filter('', '', false)
      await flush()
      expect(api.listRiskSamples.mock.lastCall?.[1].candidatesOnly).toBe(false)
      expect(state.rows.map(state.sampleLevel)).toEqual(['提示', '未检出风险', '无法判断'])
      state.filter('NOTICE')
      await flush()
      expect(api.listRiskSamples.mock.lastCall?.[1]).toMatchObject({
        candidatesOnly: true,
        level: 'NOTICE',
        page: 1,
      })
    } finally {
      unmount()
    }
  })
  it('后端返回其他语种的结果时拒绝展示', async () => {
    const { state, unmount } = mount()
    await flush()
    const previous = state.result!
    api.getLatestRisk.mockResolvedValueOnce(previous)
    state.scope.language = 'en'
    await state.loadScope()
    expect(state.result).toBeNull()
    expect(state.rows).toEqual([])
    expect(state.error).toContain('不一致')
    unmount()
  })
  it('切换条件同步清空旧结果、详情、抽屉；迟到结果不能覆盖新条件', async () => {
    const { state, unmount } = mount()
    await flush()
    expect(state.selected).toBeDefined()
    const old = state.result!
    let resolve!: (r: Result | null) => void
    api.getLatestRisk.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r
        }),
    )
    state.scope.language = 'en'
    state.drawer = '完整依据'
    const pending = state.loadScope()
    expect(state.result).toBeNull()
    expect(state.selected).toBeUndefined()
    expect(state.rows).toEqual([])
    expect(state.drawer).toBe('')
    state.scope.language = 'ja'
    await state.loadScope()
    resolve(old)
    await pending
    expect(state.result).toBeNull()
    expect(state.rows).toEqual([])
    unmount()
  })
  it('等级图筛选清除冲突条件，选中行完整联动规则、案例与复核工单', async () => {
    const { state, unmount } = mount()
    await flush()
    expect(state.selected?.review?.status).toBe('待复核')
    state.openReview()
    expect(state.drawer).toBe('人工复核')
    state.query.keyword = '无匹配'
    state.query.status = '待复核'
    state.filter('NOTICE')
    await flush()
    expect(state.query.keyword).toBe('')
    expect(state.query.status).toBe('')
    expect(state.total).toBe(state.result!.levels.find((l) => l.level === 'NOTICE')!.count)
    expect(state.selected?.rules[0]?.id).toBe('MIS-01')
    expect(state.selected?.cases[0]?.ruleId).toBe('MIS-01')
    expect(state.selected?.review).toBeUndefined()
    expect(state.selected?.actions).toContain('createReview')
    state.filter('HIGH')
    await flush()
    expect(state.rows).toEqual([])
    expect(state.selected).toBeUndefined()
    unmount()
  })
  it('快速切换选中行，迟到详情不会覆盖当前样本；翻页保留总数', async () => {
    const { state, unmount } = mount()
    await flush()
    const [a, b] = state.rows
    let resolve!: (s: Sample) => void
    api.getRiskSample.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r
        }),
    )
    const pending = state.choose(a!)
    await state.choose(b!)
    resolve(a!)
    await pending
    expect(state.selected?.id).toBe(b!.id)
    state.query.pageSize = 1
    state.query.page = 2
    const total = state.total
    await state.loadRows()
    expect(state.total).toBe(total)
    expect(state.rows).toHaveLength(1)
    expect(state.selected?.id).toBe(b!.id)
    unmount()
  })
  it('任务创建失败显示错误，仍保留上次结果', async () => {
    const { state, unmount } = mount()
    await flush()
    const previous = state.result
    api.startRisk.mockRejectedValue(new Error('后端暂不可用'))
    await state.start()
    expect(state.runIssue).toBe('后端暂不可用')
    expect(state.result).toEqual(previous)
    expect(state.rows.length).toBeGreaterThan(0)
    unmount()
  })
  it('切换方案会查询各自的任务，返回页面后继续加载当前方案的结果', async () => {
    const options = riskMock.options()
    const alternative = { ...options.schemes[0]!, id: 'risk-other-scheme' }
    api.getRiskOptions.mockResolvedValue({
      ...options,
      schemes: [...options.schemes, alternative],
    })
    const first = mount()
    await flush()
    const fallback = first.state.result!
    const dataset = options.datasets.find((item) => item.versions.length > 1)!
    Object.assign(first.state.scope, {
      datasetId: dataset.id,
      versionId: dataset.versions[1]!.id,
      schemeId: alternative.id,
    })
    await first.state.loadScope()
    const input = { ...first.state.scope }
    const task = { id: 'risk-run-on-return', status: 'running', input }
    api.startRisk.mockResolvedValue(task)
    await first.state.start()
    Object.assign(first.state.scope, fallback.scope)
    await first.state.loadScope()
    expect(first.state.runLocked).toBe(false)
    expect(api.getRiskTask).not.toHaveBeenCalled()
    Object.assign(first.state.scope, input)
    api.getRiskTask.mockResolvedValue(task)
    await first.state.loadScope()
    await flush()
    expect(first.state.runMessage).toBe('任务正在运行')
    first.unmount()
    const next = { ...fallback, id: 'risk-saved-on-return', scope: input }
    api.getRiskTask.mockResolvedValue({ ...task, status: 'succeeded', resultId: next.id })
    api.getRiskResult.mockResolvedValue(next)
    api.listRiskSamples.mockResolvedValue({ items: [], total: 0 })
    const second = mount()
    try {
      await flush()
      expect(second.state.scope).toEqual(input)
      expect(second.state.result?.id).toBe(next.id)
      expect(second.state.runLocked).toBe(false)
      expect(api.getRiskTask.mock.lastCall).toEqual([task.id])
      expect(api.startRisk).toHaveBeenCalledExactlyOnceWith(input)
    } finally {
      second.unmount()
    }
  })
  it('主动选择历史结果后，迟到的新结果不会覆盖当前查看的记录', async () => {
    vi.useFakeTimers()
    const { state, unmount } = mount()
    try {
      await flush()
      const previous = state.result!
      const task = { id: 'risk-run-during-history', input: { ...state.scope }, status: 'running' }
      api.startRisk.mockResolvedValue(task)
      const saved = { ...previous, id: 'risk-new-result' }
      api.getRiskTask.mockResolvedValue({ ...task, status: 'succeeded', resultId: saved.id })
      let complete!: (value: Result) => void
      api.getRiskResult.mockImplementationOnce(
        () =>
          new Promise<Result>((resolve) => {
            complete = resolve
          }),
      )
      await state.start()
      await vi.advanceTimersByTimeAsync(2000)
      expect(api.getRiskResult).toHaveBeenCalledWith(saved.id)
      api.getRiskResult.mockResolvedValueOnce(previous)
      await state.useHistory(previous)
      complete(saved)
      await flush()
      expect(state.result?.id).toBe(previous.id)
      expect(state.runLocked).toBe(false)
    } finally {
      unmount()
      vi.useRealTimers()
    }
  })
})
