import type { Kpi } from '../types'
import type { ProcessKpi } from '../types/data-governance'

const integer = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })

export const processKpiDescriptions: Record<string, string> = {
  'process-0': '已结束的处理任务数（成功＋失败），不含排队中、运行中或已取消的任务。',
  'process-1': '当前正在执行的处理任务数，不含排队中和已结束的任务。',
  'process-2': '所有处理任务实际已处理的累计条次，含运行中的已处理部分；重复处理重复计数。',
  'process-3': '成功任务数÷处理任务总数；括号为成功数/总数，总数与第一张卡片一致。取消任务不计入。',
}

export function formatProcessKpi(item: Kpi, items: Kpi[]) {
  if (item.id === 'process-2') {
    const scale = item.value >= 100_000_000 ? 100_000_000 : item.value >= 10_000 ? 10_000 : 1
    // 截取到两位小数，避免 99,999,999 等临界值被显示为已经达到 1 亿。
    const value = scale === 1 ? item.value : Math.floor((item.value / scale) * 100) / 100
    return {
      value: scale === 1 ? integer.format(value) : decimal.format(value),
      unit: `${scale === 100_000_000 ? '亿' : scale === 10_000 ? '万' : ''}条次`,
      suffix: '',
    }
  }
  if (item.id === 'process-3') {
    const total = items.find((kpi) => kpi.id === 'process-0')?.value
    const succeeded = (item as ProcessKpi).succeededCount
    const validTotal = typeof total === 'number' && Number.isSafeInteger(total) && total >= 0
    const validSucceeded =
      validTotal &&
      typeof succeeded === 'number' &&
      Number.isSafeInteger(succeeded) &&
      succeeded >= 0 &&
      succeeded <= total
    return {
      value: validSucceeded && total > 0 ? decimal.format((succeeded / total) * 100) : '—',
      unit: validSucceeded && total > 0 ? '%' : '',
      suffix: `（${validSucceeded ? integer.format(succeeded) : '—'}/${validTotal ? integer.format(total) : '—'}）`,
    }
  }
  return { value: item.displayValue ?? integer.format(item.value), unit: item.unit, suffix: '' }
}
