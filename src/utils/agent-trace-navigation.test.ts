import { describe, expect, it } from 'vitest'
import { agentTraceTabQuery } from './agent-trace-navigation'
describe('agent trace tab scope', () => {
  it('keeps shared snapshot/sample/event but removes projection and page filters', () => {
    const source = {
      view: 'execution',
      batchId: 'mock_batch_demo',
      snapshotId: 'mock_batch_demo_snapshot',
      projectionVersion: 'p1',
      traceId: 'mock_trace_0',
      eventId: 'mock_trace_0_event_12',
      page: '3',
      language: 'en',
      listFilter: 'risk',
    }
    expect(agentTraceTabQuery(source, 'statistics')).toEqual({
      view: 'statistics',
      batchId: 'mock_batch_demo',
      snapshotId: source.snapshotId,
      traceId: source.traceId,
      eventId: source.eventId,
    })
    expect(source.eventId).toBe('mock_trace_0_event_12')
  })
  it('does not carry statistics versions into other tabs', () => {
    for (const view of ['ingest', 'tools', 'execution'] as const)
      expect(
        agentTraceTabQuery(
          { batchId: 'batch', projectionVersion: 'stats_1', snapshotId: 'snapshot' },
          view,
        ),
      ).toEqual({ view, batchId: 'batch', snapshotId: 'snapshot' })
  })
  it('ignores absent or invalid batch IDs', () => {
    expect(agentTraceTabQuery({}, 'statistics')).toEqual({ view: 'statistics' })
    expect(agentTraceTabQuery({ batchId: ['a', 'b'] }, 'tools')).toEqual({ view: 'tools' })
  })
})
