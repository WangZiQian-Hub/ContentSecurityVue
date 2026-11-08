import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import AssessmentNotice from './AssessmentNotice.vue'
import { analysisError } from '../types/assessment'
import { governanceResult } from '../views/model-train/governance-result'

describe('分析可用性', () => {
  it('历史记录没有新字段时不改变原状态', async () => {
    const html = await renderToString(createSSRApp(AssessmentNotice, { value: {} }))
    expect(html).not.toContain('无法判断')
  })
  it.each(['unavailable', 'partial'] as const)('正常展示不可用信息：%s', async (assessmentStatus) => {
    const html = await renderToString(createSSRApp(AssessmentNotice, {
      value: { assessmentStatus, unavailableFields: ['score'], assessmentReason: '材料缺少依据' },
    }))
    expect(html).toContain(assessmentStatus === 'partial' ? '部分可判断' : '无法判断')
    expect(html).toContain('0 占位')
    expect(html).toContain('不计入有效评分')
    expect(html).not.toContain('invalid_struct')
  })
  it('真实零分仍显示正常分析', async () => {
    const html = await renderToString(createSSRApp(AssessmentNotice, {
      value: { assessmentStatus: 'assessed', unavailableFields: [] },
    }))
    expect(html).toContain('正常分析')
    expect(html).not.toContain('0 占位')
  })
  it('历史解析错误使用中文，真实服务错误保留原因', () => {
    expect(analysisError('invalid_structured_output', 'old error')).toContain('历史模型结果未通过校验')
    expect(analysisError('provider_timeout', '请求超时')).toBe('请求超时')
  })
  it('治理兜底不被显示为已脱敏或低风险', () => {
    const result = governanceResult({
      status: 'succeeded', riskLevel: 'unknown', originalOutput: '原文',
      governedOutput: '资料不足，无法判断', assessmentStatus: 'unavailable',
    })
    expect(result.label).toBe('无法判断')
    expect(result.triggered).toBe(false)
  })
})
