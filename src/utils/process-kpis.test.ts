import { describe, expect, it } from 'vitest'
import type { TaskStatus } from '../types'
import { getProcessKpis, processTasks } from '../mock/data-governance'
import { formatProcessKpi } from './process-kpis'

describe('数据处理卡片统计和显示', () => {
  it('总数和成功率只计成功、失败任务，运行数单独统计', () => {
    const statuses: TaskStatus[] = ['succeeded', 'failed', 'running', 'pending', 'cancelled']
    const kpis = getProcessKpis(
      statuses.map((status, index) => ({
        ...processTasks[0]!,
        taskId: `task-${index}`,
        status,
        processedCount: 10,
      })),
    )
    expect(kpis[0]!.value).toBe(2)
    expect(kpis[1]!.value).toBe(1)
    expect(kpis[2]!.value).toBe(50)
    expect(formatProcessKpi(kpis[3]!, kpis)).toEqual({ value: '50', unit: '%', suffix: '（1/2）' })
  })

  it.each([
    [0, '0', '条次'],
    [9999, '9,999', '条次'],
    [10000, '1', '万条次'],
    [20000, '2', '万条次'],
    [123456, '12.34', '万条次'],
    [99999999, '9,999.99', '万条次'],
    [100000000, '1', '亿条次'],
    [200000000, '2', '亿条次'],
  ])('累计 %i 条次显示为 %s%s', (value, expected, unit) => {
    const kpis = getProcessKpis()
    expect(formatProcessKpi({ ...kpis[2]!, value }, kpis)).toEqual({
      value: expected,
      unit,
      suffix: '',
    })
  })

  it('示例成功率为100%（2/2）；分母始终取第一张卡片，不使用过期百分比', () => {
    const kpis = getProcessKpis()
    expect(formatProcessKpi(kpis[3]!, kpis)).toEqual({ value: '100', unit: '%', suffix: '（2/2）' })
    kpis[0]!.value = 3
    expect(formatProcessKpi(kpis[3]!, kpis)).toEqual({
      value: '66.67',
      unit: '%',
      suffix: '（2/3）',
    })
  })

  it('零分母显示不适用，缺失或不一致的成功数不被反推或伪造', () => {
    const empty = getProcessKpis([])
    expect(formatProcessKpi(empty[3]!, empty)).toEqual({ value: '—', unit: '', suffix: '（0/0）' })
    const kpis = getProcessKpis()
    delete kpis[3]!.succeededCount
    expect(formatProcessKpi(kpis[3]!, kpis)).toEqual({ value: '—', unit: '', suffix: '（—/2）' })
    kpis[3]!.succeededCount = 3
    expect(formatProcessKpi(kpis[3]!, kpis)).toEqual({ value: '—', unit: '', suffix: '（—/2）' })
  })
})
