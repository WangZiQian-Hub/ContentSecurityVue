import { describe, expect, it } from 'vitest'
import { toolsFixture } from '../mock/agent-trace-tools'
import { toolOutcome, efficiencyLabel } from './tool-outcome'

describe('工具调用结果说明', () => {
  it('旧记录没有归因字段时仍显示权限拒绝原因', () => {
    const call = structuredClone(toolsFixture().selection!)
    call.analysis.errorAttribution = null
    expect(toolOutcome(call).kind).toBe('policy_denied')
    expect(toolOutcome(call).message).toContain('restricted.export')
    expect(toolOutcome(call).message).toContain('未执行')
  })
  it('优先展示后端统一原因', () => {
    const call = structuredClone(toolsFixture().selection!)
    call.analysis.outcomeReason = { kind: 'policy_denied', message: '真实策略拒绝，未生成文件' }
    expect(toolOutcome(call)).toEqual(call.analysis.outcomeReason)
  })
  it('区分执行成功、执行错误、停止未执行和未知原因', () => {
    const call = structuredClone(toolsFixture().calls.items[0]!)
    expect(toolOutcome(call).message).toBe('调用执行成功')
    call.executionStatus = 'failed'
    call.resultCode = 'TIMEOUT'
    expect(toolOutcome(call).message).toContain('TIMEOUT')
    call.executionStatus = 'not_executed'
    call.nonExecutionReason = '任务达到运行限额'
    expect(toolOutcome(call).message).toBe('任务达到运行限额')
    call.executionStatus = 'unknown'
    expect(toolOutcome(call).message).toBe('源日志未提供原因')
    expect(toolOutcome(null).message).toBe('源日志未提供原因')
  })
  it('重复和重试不会显示为已确认低效', () => {
    expect(efficiencyLabel('duplicate')).toBe('重复请求（待核查）')
    expect(efficiencyLabel('retry')).toBe('重试（待核查）')
    expect(efficiencyLabel('inefficient')).toBe('已记录低效证据')
  })
})
