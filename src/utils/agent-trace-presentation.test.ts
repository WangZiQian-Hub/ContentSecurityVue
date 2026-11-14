import { describe, expect, it } from 'vitest'
import {
  groupTraceFindings,
  traceEvidenceText,
  traceRiskSummary,
  type RuleFinding,
} from './agent-trace-presentation'

const finding = (ruleId: string, category: RuleFinding['category'] = 'security'): RuleFinding => ({
  findingId: ruleId,
  ruleId,
  ruleVersion: 'v1',
  category,
  label: ruleId,
  eventId: 'event-10',
  eventDisplayId: 'STEP-10',
  callId: 'call-4',
  outcome: 'blocked',
  evidenceText: '原始证据',
})
describe('审计页面的文字展示', () => {
  it('合并同一次越权调用的重复结论，保留全部依据', () => {
    const items = [
      finding('unauthorized_request'),
      finding('prohibited_request'),
      finding('policy_denied', 'policy'),
    ]
    const before = JSON.stringify(items)
    const groups = groupTraceFindings(items)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.title).toBe('越权请求')
    expect(groups[0]?.items).toHaveLength(3)
    expect(groups[0]?.outcome).toBe('blocked')
    expect(JSON.stringify(items)).toBe(before)
  })
  it('分别展示不同调用的问题和运行异常', () => {
    const items = [
      finding('unauthorized_request'),
      { ...finding('prohibited_request'), callId: 'other-call' },
      finding('tool_error', 'operation'),
    ]
    expect(groupTraceFindings(items)).toHaveLength(3)
  })
  it('不把所有策略拦截都称为越权，也不把未知结果改成已拦截', () => {
    const policy = groupTraceFindings([finding('policy_denied', 'policy')])[0]!
    expect(policy.title).toBe('请求被拦截')
    const unknown = groupTraceFindings([
      { ...finding('prohibited_request'), outcome: 'unknown' },
    ])[0]!
    expect(unknown.title).toBe('违规请求')
    expect(unknown.outcome).toBe('unknown')
  })
  it('标题去掉重叠描述，但保留其他风险类别', () => {
    expect(
      traceRiskSummary([
        { code: 'unauthorized_request', label: '超出记录授权范围的请求' },
        { code: 'prohibited_request', label: '请求违反明确策略（已拦截）' },
        { code: 'privacy', label: '隐私泄露' },
      ]),
    ).toBe('越权请求、隐私泄露')
  })
  it('权限对比改成分行说明，其余证据原文保持不变', () => {
    expect(traceEvidenceText('{"granted":["public.read"],"requested":["restricted.export"]}')).toBe(
      '允许的权限：public.read\n请求的权限：restricted.export',
    )
    const text = '{"message":"禁止发送邮件"}'
    expect(traceEvidenceText(text)).toBe(text)
    expect(traceEvidenceText('未提供内容')).toBe('未提供内容')
  })
})
