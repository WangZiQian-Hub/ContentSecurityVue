import { beforeEach, describe, expect, it, vi } from 'vitest'
const backend = vi.hoisted(() => ({ isMock: true, request: vi.fn() }))
vi.mock('./request', () => backend)
import {
  getSummary,
  getResourceFilterOptions,
  listDatasets,
  listIngestTasks,
} from './data-resource'
import { listDatasets as legacyDatasets } from './dataset'
import { getGovernanceResources } from './governance-resources'
import { getResourceSummary, resourceFilterOptions } from '../mock/resource-statistics'
import { resourceDatasets } from '../mock/resource-catalog'
import { resourceSamples } from '../mock/resource-samples'
describe('资源统计有据汇总及跨页目录一致性', () => {
  beforeEach(() => {
    backend.isMock = true
    backend.request.mockReset()
  })
  it('列表、治理、旧平台目录和统计均对应六个数据集；记录数对应完整样本', async () => {
    const [list, governance, legacy, summary] = await Promise.all([
      listDatasets({ page: 1, pageSize: 100 }),
      getGovernanceResources(),
      legacyDatasets(),
      getSummary('statistics'),
    ])
    expect(governance.map((d) => d.id)).toEqual(list.items.map((d) => d.id))
    expect(legacy.items.map((d) => [d.id, d.name, d.version])).toEqual(
      list.items.map((d) => [d.id, d.name, d.versionId]),
    )
    expect(summary.kpis.find((k) => k.id === 'datasets')!.value).toBe(list.total)
    expect(summary.kpis.find((k) => k.id === 'records')!.value).toBe(resourceSamples.length)
    for (const d of list.items)
      expect(d.rowCount).toBe(
        resourceSamples.filter((s) => s.datasetId === d.id && s.versionId === d.versionId).length,
      )
    expect(summary.kpis.find((k) => k.id === 'storage')!.value).toBeCloseTo(
      list.items.reduce((n, d) => n + d.storageGb, 0),
      1,
    )
  })
  it('语种图与筛选由同一多标签字段汇总；无阿拉伯语/其他时不编造占比', async () => {
    const [options, summary] = await Promise.all([
      getResourceFilterOptions(),
      getSummary('statistics'),
    ])
    expect(options.languages.map((l) => l.code).sort()).toEqual(
      summary.languages.map((l) => l.code).sort(),
    )
    expect(summary.languages.map((l) => l.name)).toEqual(['中文', '英文', '日文'])
    for (const l of summary.languages)
      expect(l.count).toBe(resourceDatasets.filter((d) => d.languages.includes(l.code!)).length)
    expect(summary.languages.reduce((n, l) => n + l.value, 0)).toBeCloseTo(100, 0)
    const expanded = structuredClone(resourceDatasets)
    expanded[0]!.languages.push('ar', 'other')
    expect(resourceFilterOptions(expanded).languages.map((l) => l.code)).toContain('ar')
    const next = getResourceSummary('statistics', {}, expanded)
    expect(next.languages.find((l) => l.code === 'ar')?.count).toBe(1)
    expect(next.languages.find((l) => l.code === 'other')?.count).toBe(1)
    expect(getResourceSummary('statistics', { language: 'ar' }, expanded).datasetIds).toEqual([1])
  })
  it('来源、模态、质量均来自选中数据集，筛选同步更新卡片和全部图表', async () => {
    const summary = await getSummary('statistics', { sourceType: 'business', language: 'en' })
    expect(summary.datasetIds).toEqual([1])
    expect(summary.kpis.find((k) => k.id === 'datasets')!.value).toBe(1)
    expect(summary.sources).toMatchObject([{ name: resourceDatasets[0]!.sourceName, value: 100 }])
    expect(summary.modalities.map((m) => m.name)).toEqual(resourceDatasets[0]!.modalities)
    expect(summary.modalityCount).toBe(resourceDatasets[0]!.modalities.length)
    expect(summary.qualityScore).toBe(resourceDatasets[0]!.qualityScore)
    const empty = await getSummary('statistics', { language: 'ar' })
    expect(empty.datasetIds).toEqual([])
    expect(empty.languages).toEqual([])
    expect(empty.sources).toEqual([])
    expect(empty.qualityScore).toBeNull()
    expect(empty.kpis.find((k) => k.id === 'success')?.displayValue).toBe('—')
  })
  it('演示快照的增长、质量、问题和使用排行均由目录记录汇总', () => {
    const base = getResourceSummary('statistics')
    expect(base.kpis.find((k) => k.id === 'storage')!.value).toBe(3712)
    expect(base.kpis.find((k) => k.id === 'availability')!.value).toBe(83.3)
    expect(base.kpis.find((k) => k.id === 'success')!.value).toBe(66.7)
    expect(base.qualityScore).toBe(89.8)
    expect(base.languages.map((row) => [row.code, row.value])).toEqual([
      ['zh', 60], ['en', 30], ['ja', 10],
    ])
    expect(base.modalities.map((row) => [row.name, row.value])).toEqual([
      ['文本', 62.5], ['图片', 12.5], ['视频', 25],
    ])
    expect(base.trend.dates).toHaveLength(7)
    expect(base.trend.total.at(-1)).toBe(base.kpis.find((k) => k.id === 'storage')!.value)
    expect(base.quality).toHaveLength(5)
    expect(base.issues).toHaveLength(4)
    expect(base.ranking).toHaveLength(resourceDatasets.length)
    expect(base.ranking.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(100, 1)
    for (const dataset of resourceDatasets) {
      expect(dataset.statistics!.storageEvents!.reduce((sum, event) => sum + event.deltaGb, 0)).toBeCloseTo(dataset.storageGb, 1)
      expect(dataset.statistics!.qualityDimensions!.reduce((sum, row) => sum + row.value, 0) / 5).toBeCloseTo(dataset.qualityScore, 1)
    }
    expect(base.issues.find((row) => row.name === '缺失字段')!.value).toBe(
      resourceDatasets.reduce((sum, dataset) => sum + dataset.statistics!.issues![0]!.value, 0),
    )
    expect(base.ranking[0]!.uses).toBe(resourceDatasets[0]!.statistics!.usageCount)
  })
  it('缺少统计证据时显示空态；有记录时按记录汇总', () => {
    const emptyDatasets = structuredClone(resourceDatasets)
    for (const dataset of emptyDatasets) dataset.statistics = undefined
    const base = getResourceSummary('statistics', {}, emptyDatasets)
    expect(base.trend.dates).toEqual([])
    expect(base.quality).toEqual([])
    expect(base.issues).toEqual([])
    expect(base.ranking).toEqual([])
    const datasets = structuredClone(resourceDatasets.slice(0, 2))
    datasets[0]!.statistics = {
      usageCount: 3,
      issues: [{ name: '缺失字段', value: 2 }],
      qualityDimensions: [{ name: '完整性', value: 80 }],
      storageEvents: [
        { at: '2024-10-08', deltaGb: 10 },
        { at: '2024-10-09', deltaGb: 5 },
      ],
    }
    datasets[1]!.statistics = {
      usageCount: 1,
      issues: [{ name: '缺失字段', value: 1 }],
      qualityDimensions: [{ name: '完整性', value: 100 }],
      storageEvents: [{ at: '2024-10-09', deltaGb: 2 }],
    }
    const result = getResourceSummary('statistics', {}, datasets, [])
    expect(result.trend).toEqual({
      dates: ['2024-10-08', '2024-10-09'],
      added: [10, 7],
      total: [10, 17],
    })
    expect(result.ranking.map((r) => r.share)).toEqual([75, 25])
    expect(result.ranking[0]!.name).toBe(datasets[0]!.name)
    expect(result.quality[0]!.value).toBe(90)
    expect(result.issues[0]!.value).toBe(3)
  })
  it('日期边界和任务关联可核查；失败任务不算成功，未结束不进入成功率分母', async () => {
    const within = await getSummary('statistics', { startDate: '2026-09-20', endDate: '2026-09-26' })
    expect(within.datasetIds).toHaveLength(resourceDatasets.length)
    const empty = await getSummary('statistics', { startDate: '2025-01-01', endDate: '2025-12-31' })
    expect(empty.datasetIds).toEqual([])
    await expect(
      getSummary('statistics', { startDate: '2026-12-31', endDate: '2026-01-01' }),
    ).rejects.toThrow()
    const tasks = await listIngestTasks({ page: 1, pageSize: 100 })
    for (const t of tasks.items) {
      const dataset = resourceDatasets.find((d) => d.id === t.datasetId)!
      expect(t.datasetName).toBe(dataset.name)
      expect(t.datasetVersionId).toBe(dataset.versionId)
    }
    const summary = await getSummary('ingest')
    expect(summary.kpis.find((k) => k.id === 'tasks')?.value).toBe(tasks.total)
    const finished = tasks.items.filter((t) => ['succeeded', 'failed'].includes(t.status))
    expect(summary.kpis.find((k) => k.id === 'success')!.value).toBeCloseTo(
      (tasks.items.filter((t) => t.status === 'succeeded').length / finished.length) * 100,
      1,
    )
  })
  it('生产筛选选项与统计参数通过保留API读取，不回退到固定图', async () => {
    backend.isMock = false
    backend.request.mockResolvedValue({ languages: [], sources: [], modalities: [] })
    await getResourceFilterOptions()
    expect(backend.request).toHaveBeenLastCalledWith({ url: '/data-resources/options' })
    await getSummary('statistics', {
      language: 'ar',
      sourceType: 'industry',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    })
    expect(backend.request).toHaveBeenLastCalledWith({
      url: '/data-resources/summary',
      params: {
        view: 'statistics',
        language: 'ar',
        sourceType: 'industry',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      },
    })
  })
})
