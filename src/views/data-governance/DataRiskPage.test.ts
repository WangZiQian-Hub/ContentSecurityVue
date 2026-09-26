import { createRenderer, nextTick, ssrContextKey } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Query, Result, Sample, Scope } from '../../types/data-risk'
const api = vi.hoisted(() => ({
  getRiskOptions: vi.fn(),
  getLatestRisk: vi.fn(),
  listRiskSamples: vi.fn(),
  getRiskSample: vi.fn(),
  searchRiskKnowledge: vi.fn(),
  startRisk: vi.fn(),
}))
vi.mock('../../api/data-risk', () => api)
vi.mock('../../api/request', () => ({ isMock: true }))
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
  loadScope(): Promise<void>
  loadRows(): Promise<void>
  choose(row: Sample): Promise<void>
  filter(level: string, status?: string): void
  openReview(): void
  start(): Promise<void>
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
    api.getRiskOptions.mockResolvedValue(riskMock.options())
    api.getLatestRisk.mockImplementation(async (s) => riskMock.latest(s))
    api.listRiskSamples.mockImplementation(async (id, q) => riskMock.samples(id, q))
    api.getRiskSample.mockImplementation(async (id, sample) => riskMock.detail(id, sample))
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
  it('任务创建失败显示错误，不残留旧结果', async () => {
    const { state, unmount } = mount()
    await flush()
    api.startRisk.mockRejectedValue(new Error('后端暂不可用'))
    await state.start()
    expect(state.error).toBe('后端暂不可用')
    expect(state.result).toBeNull()
    expect(state.rows).toEqual([])
    unmount()
  })
})
