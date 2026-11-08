import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAgentTraceStatisticsStore } from './agent-trace-statistics'
import { createAgentTraceMock } from '../mock/agent-traces'
import { createAgentTraceStatisticsMock } from '../mock/agent-trace-statistics'
import type {
  AgentTraceStatisticsDetail,
  AgentTraceStatisticsPage,
  AgentTraceStatisticsWorkspace,
} from '../types/agent-trace-statistics'
const deferred = <T>() => {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}
function fixture() {
  const ingest = createAgentTraceMock()
  return createAgentTraceStatisticsMock((q) => ingest.statisticsSource!(q))
}
describe('statistics request lifecycle', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('loads one aggregate, does not prefetch detail and keeps upper aggregates on list changes', async () => {
    const api = fixture(),
      stats = vi.spyOn(api, 'statistics'),
      detail = vi.spyOn(api, 'sample'),
      store = useAgentTraceStatisticsStore()
    store.configure(true, api)
    await store.load({})
    expect(stats).toHaveBeenCalledTimes(1)
    expect(detail).not.toHaveBeenCalled()
    const before = store.workspace!.kpis
    await store.samples(1, 'risk')
    expect(store.workspace!.kpis).toEqual(before)
    await store.select(store.workspace!.samplePage.items[5].traceId)
    await store.select(store.detail!.navigation.next!.traceId)
    expect(store.query.page).toBe(2)
    expect(store.detail!.navigation.position).toBe(7)
    store.close()
    expect(stats).toHaveBeenCalledTimes(1)
    store.dispose()
  })
  it('ignores late lists after a new main query and late main queries', async () => {
    const api = fixture(),
      store = useAgentTraceStatisticsStore()
    store.configure(true, api)
    await store.load({})
    const stale = await api.samples(store.query.batchId!, { ...store.query, page: 2 }),
      pending = deferred<AgentTraceStatisticsPage>()
    vi.spyOn(api, 'samples').mockReturnValueOnce(pending.promise)
    const first = store.samples(2)
    await store.load({ language: 'zh' })
    pending.resolve(stale)
    await first
    expect(store.workspace!.samplePage.items.every((r) => r.language === 'zh')).toBe(true)
    expect(store.query.page).toBe(1)
    const old = await api.statistics({}),
      p = deferred<AgentTraceStatisticsWorkspace>()
    vi.spyOn(api, 'statistics').mockReturnValueOnce(p.promise)
    const oldLoad = store.load({})
    await store.load({ language: 'en' })
    p.resolve(old)
    await oldLoad
    expect(store.workspace!.scope!.language).toBe('en')
    store.dispose()
  })
  it('clears previous JSON immediately and rejects stale detail after close or mode switch', async () => {
    const api = fixture(),
      store = useAgentTraceStatisticsStore()
    store.configure(true, api)
    await store.load({})
    const id = store.workspace!.samplePage.items[0].traceId,
      d = await api.sample(store.query.batchId!, id, store.query),
      p = deferred<AgentTraceStatisticsDetail>()
    vi.spyOn(api, 'sample').mockReturnValueOnce(p.promise)
    const request = store.select(id)
    store.configure(false)
    p.resolve(d)
    await request
    expect(store.detail).toBeNull()
    expect(store.workspace).toBeNull()
    expect(store.opened).toBe(false)
    store.dispose()
  })
  it('rejects mismatched navigation context instead of mixing snapshots', async () => {
    const api = fixture(),
      store = useAgentTraceStatisticsStore()
    store.configure(true, api)
    await store.load({})
    const id = store.workspace!.samplePage.items[0].traceId,
      d = await api.sample(store.query.batchId!, id, store.query)
    d.navigation.context.language = 'en'
    vi.spyOn(api, 'sample').mockResolvedValue(d)
    await store.select(id)
    expect(store.detail).toBeNull()
    expect(store.detailError).toContain('不一致')
    store.dispose()
  })
})
