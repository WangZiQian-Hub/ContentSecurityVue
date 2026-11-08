import { expect, it } from 'vitest'
import { createAgentTraceMock } from './agent-traces'
import { createAgentTraceStatisticsMock } from './agent-trace-statistics'
it('matches reference totals while leaving other pages and source records intact', async () => {
  const source = createAgentTraceMock(),
    before = source.statisticsSource!({}),
    api = createAgentTraceStatisticsMock((q) => source.statisticsSource!(q), true),
    w = await api.statistics({})
  expect(Object.values(w.kpis).map((m) => m.value)).toEqual([
    200, 128, 248600, 1.58, 486, 8, 14.2, 86,
  ])
  expect(w.samplePage.items.map((r) => r.displayId)).toEqual([
    'AUD-0039',
    'AUD-0040',
    'AUD-0041',
    'AUD-0042',
    'AUD-0043',
    'AUD-0044',
  ])
  expect(w.charts.durationDistribution.p50Ms).toBe(3200)
  expect(w.charts.durationDistribution.p95Ms).toBe(8700)
  expect(w.completeness.missingUnionCount).toBe(40)
  expect(
    w.charts.behaviorMatrix.rows.flatMap((r) => r.cells).reduce((n, c) => n + (c.count || 0), 0),
  ).toBe(238)
  expect(source.statisticsSource!({})).toEqual(before)
  api.dispose?.()
  source.dispose?.()
})
