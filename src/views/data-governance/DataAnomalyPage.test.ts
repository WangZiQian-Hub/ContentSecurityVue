import { createRenderer, nextTick, ssrContextKey } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Query, Result, Sample, Scope } from '../../types/data-anomaly'
const api = vi.hoisted(() => ({
  getAnomalyOptions: vi.fn(),
  getLatestAnomaly: vi.fn(),
  getAnomalyChangeSet: vi.fn(),
  getAnomalyReviewState: vi.fn(),
  getAnomalyResult: vi.fn(),
  startAnomaly: vi.fn(),
  getAnomalyTask: vi.fn(),
  updateCandidate: vi.fn(),
  listAnomalySamples: vi.fn(),
  getAnomalySample: vi.fn(),
}))
const mode = vi.hoisted(() => ({ llm: false }))
vi.mock('../../api/data-anomaly', () => api)
vi.mock('../../api/request', () => ({ isMock: true }))
// 本文件守护“业务后端/演示模式”下的异常页行为：固定 isGovernanceLlm=false，
// 避免开发者本地 .env.local 的 VITE_GOVERNANCE_BACKEND=llm 改变页面取数路径。
vi.mock('../../api/governance-llm', () => ({
  get isGovernanceLlm() {
    return mode.llm
  },
}))
vi.mock('../../components/PanelCard.vue', () => ({ default: { render: () => null } }))
import Page from './DataAnomalyPage.vue'
import { anomalyMock } from '../../mock/data-anomaly'
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
  detectionScheme: string
  scope: Scope
  query: Query
  result: Result | null
  selected?: Sample
  rows: Sample[]
  total: number
  drawer: string
  error: string
  runMessage: string
  runLocked: boolean
  start(): Promise<void>
  loadScope(): Promise<void>
  loadRows(): Promise<void>
  choose(row: Sample): Promise<void>
  act(action: string): Promise<void>
  filter(status: string, type: string): void
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
describe('异常页结果与详情状态隔离', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    const storage = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: storage.get.bind(storage),
      setItem: storage.set.bind(storage),
      removeItem: storage.delete.bind(storage),
    })
    mode.llm = false
    api.getAnomalyOptions.mockResolvedValue(anomalyMock.options())
    api.getLatestAnomaly.mockImplementation(async (s) => anomalyMock.latest(s))
    api.getAnomalyChangeSet.mockImplementation(async (s) => anomalyMock.changeSet(s))
    api.listAnomalySamples.mockImplementation(async (id, q) => anomalyMock.samples(id, q))
    api.getAnomalySample.mockImplementation(async (id, s) => anomalyMock.detail(id, s))
  })
  afterEach(() => vi.unstubAllGlobals())
  it('返回异常页时恢复选择和任务，检测完成后加载新结果的复核状态', async () => {
    mode.llm = true
    const defaults = anomalyMock.options()
    const schemeId = 'anomaly-other-scheme'
    api.getAnomalyOptions.mockResolvedValue({
      ...defaults,
      schemes: [...defaults.schemes, { id: schemeId, name: '测试方案' }],
    })
    api.getLatestAnomaly.mockResolvedValue(null)
    const first = mount()
    await flush()
    first.state.scope.schemeId = schemeId
    await first.state.loadScope()
    const input = { ...first.state.scope }
    const task = { taskId: 'anomaly-run-on-return', status: 'running', input }
    api.startAnomaly.mockResolvedValue(task)
    await first.state.start()
    first.unmount()
    const demo = anomalyMock.latest({ ...input, language: 'zh', schemeId: defaults.schemes[0]!.id })!
    const saved = { ...demo, scope: input, id: 'anomaly-saved-on-return' }
    api.getAnomalyTask.mockResolvedValue({ ...task, status: 'succeeded', resultId: saved.id })
    api.getAnomalyResult.mockResolvedValue(saved)
    api.getAnomalyReviewState.mockResolvedValue({ editable: true, reviews: [] })
    api.listAnomalySamples.mockResolvedValue({ items: [], total: 0 })
    const second = mount()
    try {
      await flush()
      expect(second.state.scope).toEqual(input)
      expect(second.state.result?.id).toBe(saved.id)
      expect(second.state.runLocked).toBe(false)
      expect(api.getAnomalyTask).toHaveBeenCalledExactlyOnceWith(task.taskId)
      expect(api.getAnomalyReviewState).toHaveBeenCalledExactlyOnceWith(saved.id)
      expect(api.startAnomaly).toHaveBeenCalledExactlyOnceWith(input)
    } finally {
      second.unmount()
    }
  })
  it('模型快照仍为草稿时，使用业务端复核状态切换动作和筛选结果', async () => {
    mode.llm = true
    const schemeId = anomalyMock.options().schemes[0]!.id
    const saved = anomalyMock.latest({
      datasetId: 3,
      versionId: 'dsv_000003',
      language: 'zh',
      schemeId,
    })!
    const mockRow = anomalyMock.samples(saved.id, {
      page: 1,
      pageSize: 5,
      keyword: '',
      type: '',
      status: '',
    }).items[0]!
    const reviewScope = { ...saved.scope, language: 'all', schemeId }
    const result = { ...saved, scope: reviewScope }
    const row: Sample = {
      ...mockRow,
      status: '待处理',
      actions: [],
      candidates: [
        {
          candidateId: 'real-candidate',
          inputSampleRevisionId: mockRow.revisionId,
          fieldChanges: [{ field: 'topic_label', before: '历史', after: '物理学' }],
          reason: '主题不符',
          validationResults: [{ name: '格式检查', passed: true }],
          status: 'DRAFT',
        },
      ],
    }
    const emptySet = { ...anomalyMock.changeSet(saved.scope), entries: [], actions: [] }
    api.getLatestAnomaly.mockResolvedValue(result)
    api.getAnomalyResult.mockResolvedValue(result)
    api.getAnomalyReviewState.mockResolvedValue({
      editable: true,
      reviews: [],
      changeSet: emptySet,
    })
    api.listAnomalySamples.mockResolvedValue({
      items: [row],
      total: 1,
      totalPages: 1,
      page: 1,
      pageSize: 5,
    })
    api.getAnomalySample.mockResolvedValue(row)
    const { state, unmount } = mount()
    await flush()
    expect(state.selected?.actions).toEqual(['submit'])
    expect(api.getAnomalyChangeSet).not.toHaveBeenCalled()
    api.getAnomalyReviewState.mockResolvedValue({
      editable: true,
      reviews: [
        {
          sampleId: row.id,
          candidateId: 'real-candidate',
          status: 'PENDING_REVIEW',
          timeline: [{ at: '2026-11-20T11:00:00', message: '提交人工复核' }],
        },
      ],
      changeSet: emptySet,
    })
    await state.act('submit')
    expect(api.updateCandidate).toHaveBeenCalledWith(
      result.id,
      row.id,
      'submit',
      'real-candidate',
      row.revisionId,
    )
    expect(state.selected?.actions).toEqual(['approve', 'reject', 'withdraw'])
    expect(state.selected?.status).toBe('待复核')
    state.filter('待复核', '')
    await flush()
    expect(api.listAnomalySamples).toHaveBeenLastCalledWith(
      result.id,
      expect.objectContaining({ status: '' }),
    )
    expect(state.rows).toHaveLength(1)
    unmount()
  })
  it('方案名称跟随当前结果，旧结果不会误标为新版方案', async () => {
    const { state, unmount } = mount()
    await flush()
    const original = state.result!
    state.result = { ...original, scope: { ...original.scope, schemeId: 'anomaly-basic-v2' } }
    expect(state.detectionScheme).toBe('anomaly-basic-v2')
    state.result = { ...original, scope: { ...original.scope, schemeId: 'historical-v0' } }
    expect(state.detectionScheme).toBe('historical-v0')
    unmount()
  })
  it('后端返回其他版本的结果时拒绝展示', async () => {
    const { state, unmount } = mount()
    await flush()
    const previous = state.result!
    api.getLatestAnomaly.mockResolvedValueOnce({
      ...previous,
      scope: { ...previous.scope, versionId: 'other-version' },
    })
    await state.loadScope()
    expect(state.result).toBeNull()
    expect(state.rows).toEqual([])
    expect(state.error).toContain('不一致')
    unmount()
  })
  it('切换条件立即清空旧结果、行、详情和抽屉，迟到响应不能覆盖新条件', async () => {
    const { state, unmount } = mount()
    await flush()
    expect(state.selected).toBeDefined()
    const old = state.result!
    let resolve!: (r: Result | null) => void
    api.getLatestAnomaly.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r
        }),
    )
    state.scope.language = 'en'
    state.drawer = '完整详情'
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
  it('类型筛选清除冲突状态搜索，行选择同步保存详情，翻页保留总数', async () => {
    const { state, unmount } = mount()
    await flush()
    state.query.keyword = '无匹配'
    state.query.status = '待复核'
    state.filter('', '标签异常')
    await flush()
    expect(state.query.keyword).toBe('')
    expect(state.query.status).toBe('')
    expect(state.total).toBe(
      state.result!.primaryTypeCounts.find((t) => t.type === '标签异常')!.count,
    )
    const row = state.rows[1]!
    await state.choose(row)
    expect(state.selected?.id).toBe(row.id)
    const total = state.total
    let resolve!: (p: ReturnType<typeof anomalyMock.samples>) => void
    api.listAnomalySamples.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r
        }),
    )
    state.query.page = 2
    await nextTick()
    expect(state.total).toBe(total)
    resolve(anomalyMock.samples(state.result!.id, { ...state.query }))
    await flush()
    expect(state.query.page).toBe(2)
    expect(state.selected?.id).toBe(state.rows[0]!.id)
    unmount()
  })
})
