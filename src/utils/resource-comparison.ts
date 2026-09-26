import type { Kpi, KpiComparison } from '../types'
import type { ResourceDailyComparison } from '../types/data-resource'

const round = (value: number) => Math.round(value * 10) / 10

export function compareResourceKpis(
  current: Kpi[],
  previous: Kpi[],
  context?: Pick<ResourceDailyComparison, 'currentAt' | 'previousAt'>,
): Kpi[] {
  if (
    context &&
    Date.parse(context.currentAt) - Date.parse(context.previousAt) !== 24 * 60 * 60 * 1000
  )
    throw new Error('日环比必须使用相隔一天的同一时点快照')
  return current.map((item) => {
    const result = { ...item, value: round(item.value) }
    if (!context) return result
    const before = previous.find((row) => row.id === item.id)
    const unit = item.unit === '%' ? 'pp' : '%'
    const unavailable = !before || !!before.displayValue || !!item.displayValue
    const zeroBaseline = !unavailable && unit === '%' && before.value === 0 && item.value !== 0
    const change =
      unavailable || zeroBaseline
        ? null
        : unit === 'pp'
          ? item.value - before.value
          : before.value === 0
            ? 0
            : ((item.value - before.value) / before.value) * 100
    result.comparison = {
      period: 'day',
      timezone: 'Asia/Shanghai',
      currentAt: context.currentAt,
      previousAt: context.previousAt,
      previousValue: before && !before.displayValue ? round(before.value) : null,
      change: change === null ? null : round(change),
      unit,
      status: unavailable ? 'unavailable' : zeroBaseline ? 'zero_baseline' : 'available',
    }
    // 保持旧字段相对变化率的语义；资源卡片以 comparison 的状态、单位和数值为准。
    result.changeRate =
      !unavailable && before.value !== 0
        ? round(((item.value - before.value) / before.value) * 100)
        : 0
    return result
  })
}

export function formatResourceComparison(comparison?: KpiComparison): string {
  if (!comparison) return '较前日 暂无历史快照'
  if (
    comparison.status === 'unavailable' ||
    (comparison.change === null && comparison.status !== 'zero_baseline')
  )
    return '较前日 —（不可比）'
  if (comparison.status === 'zero_baseline') return '较前日 新增（原为0）'
  if (comparison.change === 0) return '→ 0%'
  return `${comparison.change! > 0 ? '↑ +' : '↓ −'}${Math.abs(comparison.change!)}${comparison.unit === 'pp' ? '个百分点' : '%'}`
}

export function resourceComparisonTone(comparison?: KpiComparison): string {
  if (comparison?.status !== 'available' || !comparison.change) return ''
  return comparison.change > 0 ? 'increase' : 'positive'
}

export function resourceComparisonTitle(item: Kpi): string {
  const comparison = item.comparison
  if (!comparison) return '服务端未提供前一日快照，无法计算日环比。'
  const at = (value: string) =>
    new Date(value).toLocaleString('zh-CN', { timeZone: comparison.timezone, hour12: false })
  const formula =
    comparison.unit === 'pp'
      ? '本期比例 − 前期比例（百分点）'
      : '（本期值 − 前期值）÷ 前期值 × 100%'
  return `日环比（北京时间）：${at(comparison.currentAt)} 对比 ${at(comparison.previousAt)}；前值 ${comparison.previousValue ?? '—'} ${item.unit}；${formula}。前值为0且本期非0时仅标记新增；比例缺少有效分母时不可比。`
}
