import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useExecutionStore } from './agent-trace-execution'
import { executionHttp } from '../api/agent-trace-execution'
import { createExecutionMock } from '../mock/agent-trace-execution'

describe('execution lifecycle', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('loads the default batch on entry but keeps later draft changes local', async () => {
    const s = useExecutionStore()
    await s.configure(true)
    expect(s.workspace?.batchSummary.sampleCount).toBe(200)
    expect(s.detail?.summary.eventCount).toBe(18)
    expect(s.loading).toBe(false)
    s.draftBatchId = 'mock_empty'
    s.dirty = true
    expect(s.canExport).toBe(false)
    expect(s.workspace?.scope?.batchId).toBe('mock_batch_demo')
    expect(s.workspace?.samplePage.total).toBe(200)
    await s.run()
    expect(s.detail).toBeNull()
    expect(s.workspace?.scope?.batchId).toBe('mock_empty')
    expect(s.workspace?.samplePage.total).toBe(0)
  })

  it('uses unchanged HTTP contracts: options, dashboard, then one default detail', async () => {
    const mock = createExecutionMock()
    const workspace = vi
      .spyOn(executionHttp, 'workspace')
      .mockImplementation((q) => mock.workspace(q))
    const detail = vi
      .spyOn(executionHttp, 'detail')
      .mockImplementation((b, t, q) => mock.detail(b, t, q))
    const s = useExecutionStore()
    await s.configure(false)
    expect(workspace.mock.calls.map(([q]) => q.include)).toEqual(['options', 'dashboard'])
    expect(workspace.mock.calls[1]?.[0].batchId).toBe('mock_batch_demo')
    expect(detail).toHaveBeenCalledTimes(1)
    expect(s.detail?.traceId).toBe('mock_trace_0')
  })

  it('restores an explicit batch and event on entry', async () => {
    const s = useExecutionStore()
    await s.configure(true, 'mock_batch_1', 'mock_trace_0', 'mock_trace_0_event_3')
    expect(s.selection?.ordinal).toBe(3)
    expect(s.draftBatchId).toBe('mock_batch_demo')
    expect(s.detailError).toBe('')
  })
  it('loads a shared-subpage batch link with a labeled selection and matching detail', async () => {
    const s = useExecutionStore()
    await s.configure(true, 'mock_batch_demo')
    expect(s.detailError).toBe('')
    expect(s.detail?.scope.batchId).toBe('mock_batch_demo')
    expect(s.options.find((b) => b.batchId === s.draftBatchId)?.displayId).toBe('AUD-2026-001')
    expect(s.detail?.summary.displayId).toBe('AUD-0042')
  })

  it('does not request dashboard or detail when no batches are available', async () => {
    const mock = createExecutionMock()
    const w = await mock.workspace({ include: 'options' })
    const workspace = vi.spyOn(executionHttp, 'workspace').mockResolvedValue({
      ...w,
      batchOptions: { items: [], total: 0, page: 1, pageSize: 50, totalPages: 0 },
    })
    const detail = vi.spyOn(executionHttp, 'detail')
    const s = useExecutionStore()
    await s.configure(false)
    expect(workspace).toHaveBeenCalledTimes(1)
    expect(detail).not.toHaveBeenCalled()
    expect(s.workspace).toBeNull()
    expect(s.loading).toBe(false)
  })

  it('keeps options available when automatic loading fails and permits retry', async () => {
    const mock = createExecutionMock()
    vi.spyOn(executionHttp, 'workspace')
      .mockResolvedValueOnce(await mock.workspace({ include: 'options' }))
      .mockRejectedValueOnce(new Error('暂时无法查询'))
      .mockImplementation((q) => mock.workspace(q))
    vi.spyOn(executionHttp, 'detail').mockImplementation((b, t, q) => mock.detail(b, t, q))
    const s = useExecutionStore()
    await s.configure(false)
    expect(s.error).toContain('暂时无法查询')
    expect(s.draftBatchId).toBe('mock_batch_demo')
    expect(s.loading).toBe(false)
    await s.run()
    expect(s.error).toBe('')
    expect(s.workspace?.samplePage.total).toBe(200)
  })

  it('updates cached selection and clears detail when filters have no matches', async () => {
    const s = useExecutionStore()
    await s.configure(true)
    await s.select('mock_trace_0_event_3')
    expect(s.selection?.ordinal).toBe(3)
    await s.search(1, { q: 'does not exist' })
    expect(s.detail).toBeNull()
    expect(s.workspace?.batchSummary.sampleCount).toBe(200)
  })

  it('uses backend totals independently from visible rows and forwards the returned page size', async () => {
    const mock = createExecutionMock()
    const initial = await mock.workspace({ include: 'dashboard', batchId: 'mock_batch_demo' })
    vi.spyOn(executionHttp, 'workspace').mockImplementation(async (q) =>
      q.include === 'options'
        ? mock.workspace(q)
        : {
            ...initial,
            batchSummary: { ...initial.batchSummary, sampleCount: 777 },
            samplePage: {
              ...initial.samplePage,
              items: initial.samplePage.items.slice(0, 4),
              total: 37,
              pageSize: 4,
              totalPages: 10,
            },
          },
    )
    vi.spyOn(executionHttp, 'detail').mockImplementation((b, t, q) => mock.detail(b, t, q))
    const samples = vi
      .spyOn(executionHttp, 'samples')
      .mockResolvedValue({
        ...initial.samplePage,
        items: initial.samplePage.items.slice(0, 4),
        total: 9,
        page: 2,
        pageSize: 4,
        totalPages: 3,
      })
    const s = useExecutionStore()
    await s.configure(false)
    expect(s.workspace?.samplePage.items).toHaveLength(4)
    expect(s.workspace?.samplePage.total).toBe(37)
    await s.search(2)
    expect(samples).toHaveBeenCalledWith(
      'mock_batch_demo',
      expect.objectContaining({ page: 2, pageSize: 4, snapshotId: initial.scope!.snapshotId }),
    )
    expect(s.workspace?.samplePage.total).toBe(9)
    expect(s.workspace?.samplePage.pageSize).toBe(4)
    expect(s.workspace?.batchSummary.sampleCount).toBe(777)
  })

  it('advances playback locally and stops at end', async () => {
    vi.useFakeTimers()
    const s = useExecutionStore()
    await s.configure(true)
    await s.select('mock_trace_0_event_17')
    s.play()
    await vi.advanceTimersByTimeAsync(1000)
    expect(s.selection?.ordinal).toBe(18)
    await vi.advanceTimersByTimeAsync(1000)
    expect(s.playing).toBe(false)
    s.dispose()
  })
})
