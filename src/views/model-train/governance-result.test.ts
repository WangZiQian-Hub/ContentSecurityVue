import { describe, expect, it } from 'vitest'
import { governanceResult, originalRiskType } from './governance-result'
import type { ModelCall } from '../../types/model-workbench'

const call = {
  status: 'succeeded',
  riskLevel: 'high',
  originalOutput: '顾客张小明，手机号码：13800138000。',
  governedOutput: '顾客张小明，手机号码：13800138000。',
} satisfies Pick<ModelCall, 'status' | 'riskLevel' | 'originalOutput' | 'governedOutput'>

describe('治理结果展示口径', () => {
  it('高风险原样返回显示治理未完成，同时计入触发治理次数', () => {
    expect(governanceResult(call)).toMatchObject({
      label: '治理未完成',
      type: 'danger',
      triggered: true,
    })
    expect(originalRiskType(call.riskLevel)).toBe('danger')
  })

  it('中风险的首尾空格变化不视为完成治理', () => {
    expect(
      governanceResult({
        ...call,
        riskLevel: 'medium',
        governedOutput: ` ${call.originalOutput} `,
      }),
    ).toMatchObject({ label: '治理未完成', triggered: true })
    expect(originalRiskType('medium')).toBe('warning')
  })

  it('改写后的历史记录不凭文本差异宣称安全', () => {
    const result = governanceResult({ ...call, governedOutput: '[姓名已脱敏]，[手机号已脱敏]。' })
    expect(result).toMatchObject({ label: '已改写', type: 'warning', triggered: true })
    expect(result.message).toContain('不代表所有风险均已消除')
  })

  it('低风险未改写不计入触发治理次数', () => {
    expect(governanceResult({ ...call, riskLevel: 'low' })).toMatchObject({
      label: '低风险，未改写',
      triggered: false,
    })
  })

  it('低风险改写不凭改写本身增加风险命中次数', () => {
    expect(
      governanceResult({ ...call, riskLevel: 'low', governedOutput: '已重新整理。' }),
    ).toMatchObject({
      label: '已改写',
      triggered: false,
    })
  })

  it.each([{ riskLevel: 'unknown' }, { governedOutput: '' }, { originalOutput: ' ' }])(
    '缺失信息显示待复核：%j',
    (change) => {
      expect(governanceResult({ ...call, ...change }).label).toBe('待复核')
    },
  )

  it.each(['failed', 'cancelled'] as const)('失败调用不显示治理成功：%s', (status) => {
    expect(governanceResult({ ...call, status })).toMatchObject({
      label: '治理失败',
      type: 'danger',
    })
  })
})
