import { describe, expect, it, vi } from 'vitest'
vi.mock('./request', () => ({ isMock: true, request: vi.fn() }))
import { getSummary } from './data-resource'
import { getResourceSummary } from '../mock/resource-statistics'
import { resourceDailyComparison } from '../mock/resource-kpi-history'
import { resourceDatasets } from '../mock/resource-catalog'
import { ingestTasks } from '../mock/resource-ingest'
import { compareResourceKpis, formatResourceComparison } from '../utils/resource-comparison'
import type { Kpi } from '../types'

describe('资源卡片日环比', () => {
  it('四页使用同一对相隔24小时的北京时间快照，并按各指标原始记录汇总', async () => {
    const expected = {
      overview: {
        datasets: [6, 0],
        storage: [3160, 17.5],
        sources: [5, 0],
        records: [590, 22],
        availability: [66.7, 16.7],
        success: [100, -33.3],
      },
      statistics: {
        datasets: [6, 0],
        storage: [3160, 17.5],
        sources: [5, 0],
        records: [590, 22],
        availability: [66.7, 16.7],
        success: [100, -33.3],
      },
      ingest: { tasks: [4, 25], running: [3, -33.3], completed: [1, 100], success: [100, -33.3] },
      datasets: { datasets: [6, 0], ready: [4, 25], processing: [2, -50], poor: [2, -50] },
    }
    for (const view of ['overview', 'statistics', 'ingest', 'datasets'] as const) {
      const summary = await getSummary(view)
      expect(summary.asOf).toBe(resourceDailyComparison.currentAt)
      for (const item of summary.kpis) {
        const comparison = item.comparison!
        expect(comparison).toMatchObject({
          period: 'day',
          timezone: 'Asia/Shanghai',
          status: 'available',
        })
        expect(Date.parse(comparison.currentAt) - Date.parse(comparison.previousAt)).toBe(86400000)
        expect([comparison.previousValue, comparison.change]).toEqual(
          expected[view][item.id as keyof (typeof expected)[typeof view]],
        )
        expect(comparison.unit).toBe(item.unit === '%' ? 'pp' : '%')
        expect(formatResourceComparison(comparison)).not.toContain('暂无')
        expect(comparison).not.toHaveProperty('datasets')
      }
    }
  })
  it('历史数据集存储量与前六天事件一致；任务不会在创建之前进入昨日快照', () => {
    expect(resourceDailyComparison.datasets.reduce((sum, row) => sum + row.rowCount, 0)).toBe(590)
    for (const row of resourceDailyComparison.datasets) {
      const events = resourceDatasets.find((dataset) => dataset.id === row.id)!.statistics!
        .storageEvents!
      expect(row.storageGb).toBeCloseTo(
        events
          .filter((event) => Date.parse(event.at) <= Date.parse(resourceDailyComparison.previousAt))
          .reduce((sum, event) => sum + event.deltaGb, 0),
        1,
      )
    }
    for (const task of resourceDailyComparison.tasks)
      expect(Date.parse(task.createdAt)).toBeLessThanOrEqual(
        Date.parse(resourceDailyComparison.previousAt),
      )
    expect(resourceDailyComparison.tasks.map((task) => task.taskId)).not.toContain('demo_ingest_5')
  })
  it('来源、语言、创建日期与数据集筛选同样应用于前后快照，不使用全局涨跌幅', async () => {
    const summary = await getSummary('statistics', {
      sourceType: 'business',
      language: 'en',
      startDate: '2026-09-20',
      endDate: '2026-09-26',
    })
    expect(summary.datasetIds).toEqual([1])
    expect(summary.kpis.find((item) => item.id === 'storage')!.comparison).toMatchObject({
      previousValue: 1580,
      change: 17.7,
    })
    expect(summary.kpis.find((item) => item.id === 'records')!.comparison).toMatchObject({
      previousValue: 100,
      change: 20,
    })
    // 昨日该数据集的任务尚在运行，无已结束任务，不能将 0/0 当作 0%。
    expect(summary.kpis.find((item) => item.id === 'success')!.comparison).toMatchObject({
      previousValue: null,
      change: null,
      status: 'unavailable',
    })
    const empty = await getSummary('statistics', { language: 'ar' })
    expect(empty.kpis.find((item) => item.id === 'datasets')!.comparison).toMatchObject({
      change: 0,
      status: 'available',
    })
    expect(empty.kpis.find((item) => item.id === 'availability')!.comparison).toMatchObject({
      change: null,
      status: 'unavailable',
    })
  })
  it('更改昨日记录会重新计算变化，历史缺失不会套用默认历史', () => {
    const previous = structuredClone(resourceDailyComparison)
    previous.datasets[0]!.rowCount = 50
    const result = getResourceSummary(
      'overview',
      { datasetId: 1 },
      resourceDatasets,
      ingestTasks,
      new Date(),
      previous,
    )
    expect(result.kpis.find((item) => item.id === 'records')!.comparison!.change).toBe(140)
    const custom = getResourceSummary('overview', {}, structuredClone(resourceDatasets))
    expect(custom.kpis.every((item) => item.comparison === undefined)).toBe(true)
  })
  it('零基数不显示无穷百分比；零到零持平，比例按百分点差；拒绝小时快照', () => {
    const item = (value: number, unit = '个'): Kpi => ({
      id: 'metric',
      label: '指标',
      value,
      unit,
      icon: 'Coin',
      changeRate: 0,
    })
    const compare = (current: Kpi, previous: Kpi) =>
      compareResourceKpis([current], [previous], resourceDailyComparison)[0]!.comparison!
    expect(compare(item(2), item(0))).toMatchObject({ change: null, status: 'zero_baseline' })
    expect(formatResourceComparison(compare(item(2), item(0)))).toBe('较前日 新增（原为0）')
    expect(compare(item(0), item(0))).toMatchObject({ change: 0, status: 'available' })
    expect(compare(item(0), item(2))).toMatchObject({ change: -100, status: 'available' })
    expect(compare(item(20, '%'), item(0, '%'))).toMatchObject({
      unit: 'pp',
      change: 20,
      status: 'available',
    })
    expect(compare(item((5 / 6) * 100, '%'), item((4 / 6) * 100, '%')).change).toBe(16.7)
    expect(() =>
      compareResourceKpis([item(2)], [item(1)], {
        currentAt: '2026-09-26T18:00:00+08:00',
        previousAt: '2026-09-26T17:00:00+08:00',
      }),
    ).toThrow('同一时点')
  })
})
