import { describe, expect, it } from 'vitest'
import { formatBeijingTime } from './beijing-time'

describe('北京时间显示', () => {
  it('将 UTC 完成时间转换为北京时间', () => {
    expect(formatBeijingTime('2026-10-31T13:21:41.170432+00:00')).toBe('2026-10-31 21:21:41')
  })

  it('跨日时显示正确日期，并识别已有的时区', () => {
    expect(formatBeijingTime('2026-10-31T18:00:00Z')).toBe('2026-11-01 02:00:00')
    expect(formatBeijingTime('2026-10-31T21:21:41+08:00')).toBe('2026-10-31 21:21:41')
  })

  it('保留无法解析的内容并处理空值', () => {
    expect(formatBeijingTime('未知')).toBe('未知')
    expect(formatBeijingTime(null)).toBe('—')
  })
})
