import { beforeEach, describe, expect, it, vi } from 'vitest'
const backend = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('./request', () => backend)
import { agentTraceStatisticsHttp as api } from './agent-trace-statistics'
describe('statistics HTTP adapter', () => {
  beforeEach(() => {
    backend.request.mockReset().mockResolvedValue({})
  })
  it('reuses list/detail resources with explicit projection, encoded IDs and cancellation', async () => {
    const signal = new AbortController().signal,
      q = { snapshotId: 's', projectionVersion: 'stats_1', language: 'zh' }
    await api.statistics(q, signal)
    await api.samples('b/id', q, signal)
    await api.sample('b/id', 't/id', q, signal)
    await api.task('task/id', signal)
    await api.ticket('a/id', 'key', signal)
    expect(backend.request.mock.calls.map((c) => c[0].url)).toEqual([
      '/compliance/agent-traces/statistics',
      '/compliance/agent-traces/batches/b%2Fid/samples',
      '/compliance/agent-traces/batches/b%2Fid/samples/t%2Fid',
      '/tasks/task%2Fid',
      '/compliance/agent-traces/artifacts/a%2Fid/download-tickets',
    ])
    expect(backend.request.mock.calls[1][0].params).toEqual({ ...q, view: 'statistics' })
    expect(backend.request.mock.calls.every((c) => c[0].signal === signal && c[0].silent)).toBe(
      true,
    )
    expect(backend.request.mock.calls[4][0].headers).toEqual({ 'X-Request-Id': 'key' })
  })
  it('does not substitute demo data on failure', async () => {
    backend.request.mockRejectedValue(new Error('unavailable'))
    await expect(api.statistics({})).rejects.toThrow('unavailable')
  })
})
