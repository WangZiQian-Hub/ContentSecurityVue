import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { getResourceSummary } from '../mock/data-resource'
const api = vi.hoisted(() => ({ getSummary: vi.fn() }))
vi.mock('../api/data-resource', () => api)
import { useDataResourceStore } from './data-resource'
describe('页面切换的异步请求', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    api.getSummary.mockReset()
  })
  it('快速切换页面时较慢的旧请求不会覆盖新页面指标', async () => {
    let resolveOld!: (data: ReturnType<typeof getResourceSummary>) => void
    api.getSummary
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve
          }),
      )
      .mockResolvedValueOnce(getResourceSummary('ingest'))
    const store = useDataResourceStore()
    const old = store.loadSummary('overview')
    await store.loadSummary('ingest')
    resolveOld(getResourceSummary('overview'))
    await old
    expect(store.summary?.kpis[0]?.label).toBe('接入任务')
    expect(store.loading).toBe(false)
  })
  it('请求失败显示错误且清空旧统计', async () => {
    api.getSummary
      .mockResolvedValueOnce(getResourceSummary('overview'))
      .mockRejectedValueOnce(new Error('offline'))
    const store = useDataResourceStore()
    await store.loadSummary('overview')
    await store.loadSummary('statistics')
    expect(store.summary).toBeUndefined()
    expect(store.error).toContain('加载失败')
    expect(store.loading).toBe(false)
  })
})
