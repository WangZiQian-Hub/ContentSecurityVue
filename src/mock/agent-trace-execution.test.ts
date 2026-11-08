import { describe, it, expect } from 'vitest'
import { createExecutionMock } from './agent-trace-execution'
describe('execution resource projections', () => {
  it('accepts the batch ID shared by the preceding subpages', async () => {
    const api = createExecutionMock()
    const w = await api.workspace({ include: 'dashboard', batchId: 'mock_batch_demo' })
    expect(w.batchOptions.items.find((b) => b.batchId === w.scope?.batchId)?.displayId).toBe(
      'AUD-2026-001',
    )
    const d = await api.detail(w.scope!.batchId, w.selectedTraceId!, {})
    expect(d.scope).toEqual(w.scope)
    expect(d.summary.displayId).toBe('AUD-0042')
  })
  it('maps only the known legacy ID and rejects unknown batches consistently', async () => {
    const api = createExecutionMock()
    const w = await api.workspace({ include: 'dashboard', batchId: 'mock_batch_1' })
    expect(w.scope?.batchId).toBe('mock_batch_demo')
    expect((await api.detail('mock_batch_1', w.selectedTraceId!, {})).scope).toEqual(w.scope)
    await expect(api.workspace({ include: 'dashboard', batchId: 'unknown_batch' })).rejects.toThrow(
      '批次不存在',
    )
    await expect(api.samples('unknown_batch', {})).rejects.toThrow('批次不存在')
    await expect(api.detail('unknown_batch', 'mock_trace_0', {})).rejects.toThrow('批次不存在')
    await expect(api.detail('mock_empty', 'mock_trace_0', {})).rejects.toThrow('不属于当前批次')
  })
  it('returns actual 200 samples with independent batch and filtered counts', async () => {
    const api = createExecutionMock()
    const w = await api.workspace({ include: 'dashboard', batchId: 'mock_batch_1' })
    expect(w.samplePage.total).toBe(200)
    expect(w.samplePage.items).toHaveLength(6)
    expect((await api.samples('mock_batch_1', { language: 'zh' })).total).toBe(100)
    expect(
      (await api.workspace({ include: 'dashboard', batchId: 'mock_empty' })).samplePage.total,
    ).toBe(0)
  })
  it('locates a risk beyond the first graph and log pages', async () => {
    const api = createExecutionMock()
    const d = await api.detail('mock_batch_1', 'mock_trace_6', {})
    expect(d.graph.nodes).toHaveLength(500)
    expect(d.events.page).toBe(11)
    expect(d.selection?.ordinal).toBe(510)
    expect(d.graph.complete).toBe(false)
    const next = await api.detail('mock_batch_1', 'mock_trace_6', {
      section: 'graph',
      graphCursor: d.graph.nextCursor!,
    })
    expect(next.graph.nodes).toHaveLength(120)
    expect(next.graph.complete).toBe(true)
  })
  it('distinguishes missing time and forbids raw access', async () => {
    const api = createExecutionMock()
    const d = await api.detail('mock_batch_1', 'mock_trace_10', {})
    expect(d.summary.durationMs).toBeNull()
    await expect(
      api.detail('mock_batch_1', 'mock_trace_10', { redactionMode: 'raw' }),
    ).rejects.toThrow('无权限')
  })
  it('keeps event identifiers aligned across evidence and graph', async () => {
    const d = await createExecutionMock().detail('mock_batch_1', 'mock_trace_0', {})
    expect(d.summary.callCount).toBe(7)
    expect(d.events.total).toBe(18)
    expect(d.graph.nodes.some((n) => n.eventId === d.selection?.eventId)).toBe(true)
    expect(d.dangerPatterns.items.every((p) => p.eventId === d.selection?.eventId)).toBe(true)
  })
})
