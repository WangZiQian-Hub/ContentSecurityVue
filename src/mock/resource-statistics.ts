import { resourceDatasets } from './resource-catalog'
import { ingestTasks } from './resource-ingest'
import { resourceDailyComparison } from './resource-kpi-history'
import { filterResourceDatasets, resourceKpis } from './resource-kpis'
import { compareResourceKpis } from '../utils/resource-comparison'
import { languageName } from '../utils/governance-language'
import type {
  Distribution,
  IngestTask,
  ResourceFilterOptions,
  ResourceSummary,
  ResourceView,
  StatisticsQuery,
  ResourceDailyComparison,
} from '../types/data-resource'
const sourceNames: Record<string, string> = {
  business: '业务数据',
  internet: '互联网',
  industry: '行业数据',
  synthetic: '合成数据',
}
const round = (n: number) => Math.round(n * 10) / 10
const day = (s: string) => s.slice(0, 10)
// 最大余数法分配 0.1 个百分点，使展示值合计恰为 100%，且每项偏差小于 0.1。
function percentages(amounts: number[]): number[] {
  const total = amounts.reduce((sum, amount) => sum + amount, 0)
  if (!total) return amounts.map(() => 0)
  const exact = amounts.map((amount) => (amount / total) * 1000)
  const tenths = exact.map((value) => Math.floor(value + 1e-9))
  const missing = 1000 - tenths.reduce((sum, value) => sum + value, 0)
  const order = exact.map((value, index) => ({ index, remainder: value - tenths[index]! }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  for (let i = 0; i < missing; i++) tenths[order[i]!.index]!++
  return tenths.map((value) => value / 10)
}
export function resourceFilterOptions(datasets = resourceDatasets): ResourceFilterOptions {
  return {
    languages: [...new Set(datasets.flatMap((d) => d.languages))].map((code) => ({
      code,
      name: languageName(code),
    })),
    sources: [...new Set(datasets.map((d) => d.sourceType))].map((code) => ({
      code,
      name: sourceNames[code] || code,
    })),
    modalities: [...new Set(datasets.flatMap((d) => d.modalities))],
  }
}
function distribution(entries: { name: string; amount: number; code?: string }[]): Distribution[] {
  const groups = new Map<string, { name: string; amount: number; code?: string }>()
  for (const entry of entries) {
    const old = groups.get(entry.code || entry.name)
    if (old) old.amount += entry.amount
    else groups.set(entry.code || entry.name, { ...entry })
  }
  const rows = [...groups.values()]
  const shares = percentages(rows.map((row) => row.amount))
  return rows.map((g, index) => ({
    name: g.name,
    code: g.code,
    count: g.amount,
    value: shares[index]!,
  }))
}
export function getResourceSummary(
  view: ResourceView,
  filters: StatisticsQuery = {},
  datasets = resourceDatasets,
  tasks: IngestTask[] = ingestTasks,
  now = new Date(),
  comparison: ResourceDailyComparison | undefined = datasets === resourceDatasets && tasks === ingestTasks
    ? resourceDailyComparison : undefined,
): ResourceSummary {
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate)
    throw new Error('开始日期不能晚于结束日期')
  const selected = filterResourceDatasets(datasets, filters)
  const ids = new Set(selected.map((dataset) => dataset.id))
  const count = selected.length
  const previousDatasets = comparison ? filterResourceDatasets(comparison.datasets, filters) : []
  const kpis = compareResourceKpis(
    resourceKpis(view, selected, tasks),
    comparison ? resourceKpis(view, previousDatasets, comparison.tasks) : [],
    comparison,
  )
  // 模态、语种是多标签元数据，统计标注构成，不能假装知道各语种/模态字节数。
  const modalities = distribution(
    selected.flatMap((d) => [...new Set(d.modalities)].map((name) => ({ name, amount: 1 }))),
  )
  const languages = distribution(
    selected.flatMap((d) =>
      [...new Set(d.languages)].map((code) => ({ name: languageName(code), code, amount: 1 })),
    ),
  )
  const sources = distribution(selected.map((d) => ({ name: d.sourceName, amount: d.storageGb })))
  const withQuality = selected.filter((d) => d.statistics?.qualityDimensions?.length)
  const names = [
    ...new Set(withQuality.flatMap((d) => d.statistics!.qualityDimensions!.map((v) => v.name))),
  ]
  const quality = names.map((name) => {
    const values = withQuality.flatMap((d) =>
      d.statistics!.qualityDimensions!.filter((v) => v.name === name),
    )
    return { name, value: round(values.reduce((n, v) => n + v.value, 0) / values.length) }
  })
  const issueRows = selected.flatMap((d) => d.statistics?.issues || [])
  const issues = [...new Set(issueRows.map((v) => v.name))].map((name) => ({
    name,
    value: issueRows.filter((v) => v.name === name).reduce((n, v) => n + v.value, 0),
  }))
  const used = selected.filter((d) => d.statistics?.usageCount !== undefined)
  const ranking = used
    .map((d) => ({
      name: d.name,
      source: d.sourceName,
      storageGb: d.storageGb,
      uses: d.statistics!.usageCount!,
      share: 0,
    }))
    .sort((a, b) => b.uses - a.uses)
  const usageShares = percentages(ranking.map((row) => row.uses))
  ranking.forEach((row, index) => { row.share = usageShares[index]! })
  const events = selected
    .flatMap((d) => d.statistics?.storageEvents || [])
    .sort((a, b) => a.at.localeCompare(b.at))
  const eventDates = [...new Set(events.map((e) => day(e.at)))].filter(
    (date) =>
      (!filters.startDate || date >= filters.startDate) &&
      (!filters.endDate || date <= filters.endDate),
  )
  const trend = {
    dates: eventDates,
    added: eventDates.map((date) =>
      round(events.filter((e) => day(e.at) === date).reduce((n, e) => n + e.deltaGb, 0)),
    ),
    total: eventDates.map((date) =>
      round(events.filter((e) => day(e.at) <= date).reduce((n, e) => n + e.deltaGb, 0)),
    ),
  }
  return {
    asOf: comparison?.currentAt,
    kpis,
    trend,
    modalities,
    sources,
    languages,
    quality,
    issues,
    ranking,
    qualityScore: count ? round(selected.reduce((n, d) => n + d.qualityScore, 0) / count) : null,
    filters: { ...filters },
    datasetIds: [...ids],
    generatedAt: now.toISOString(),
    options: resourceFilterOptions(datasets),
    modalityCount: modalities.reduce((n, m) => n + (m.count || 0), 0),
    basis: {
      languages: '按筛选后数据集的语种标注次数统计；多语数据集可贡献多个标注，不代表语料条数占比。',
      modalities:
        '按筛选后数据集的模态标注次数统计；多模态数据集可贡献多个标注，不代表存储量占比。',
      sources: '按筛选后数据集登记存储量汇总；日期筛选为数据集创建日期。',
      quality: quality.length
        ? '质量维度来自数据集质量明细；综合分为选中数据集保存评分的算术均值。'
        : '暂无五维质量明细；综合分仅为数据集已保存评分的算术均值。',
      trend: events.length
        ? '按资源存储增量事件汇总，累计量包含完整事件历史。'
        : '暂无存储增量事件，不能从当前存储快照推算历史增长。',
      issues: issues.length
        ? '按选中数据集已保存问题统计汇总。'
        : '暂无数据集问题明细，待质量统计接口提供。',
      ranking: ranking.length
        ? '按选中数据集已保存使用次数排序。'
        : '暂无数据集使用记录，待使用审计接口提供。',
    },
  }
}
