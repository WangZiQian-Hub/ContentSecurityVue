import { createRenderer, nextTick, ssrContextKey } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Query, Result, Sample, Scope } from '../../types/data-anomaly'
const api = vi.hoisted(() => ({
  getAnomalyOptions: vi.fn(),
  getLatestAnomaly: vi.fn(),
  getAnomalyChangeSet: vi.fn(),
  listAnomalySamples: vi.fn(),
  getAnomalySample: vi.fn(),
}))
vi.mock('../../api/data-anomaly', () => api)
vi.mock('../../api/request', () => ({ isMock: true }))
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
    api.getAnomalyOptions.mockResolvedValue(anomalyMock.options())
    api.getLatestAnomaly.mockImplementation(async (s) => anomalyMock.latest(s))
    api.getAnomalyChangeSet.mockImplementation(async (s) => anomalyMock.changeSet(s))
    api.listAnomalySamples.mockImplementation(async (id, q) => anomalyMock.samples(id, q))
    api.getAnomalySample.mockImplementation(async (id, s) => anomalyMock.detail(id, s))
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
