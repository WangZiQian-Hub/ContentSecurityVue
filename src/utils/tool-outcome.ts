import type { ToolSelection } from '../types/agent-trace-tools'

/** Older snapshots/APIs may not yet expose the unified outcome reason. */
export function toolOutcome(call: ToolSelection | null) {
  if (!call) return { kind: 'unknown', message: '源日志未提供原因' }
  const unified = call.analysis.outcomeReason
  if (unified?.message) return unified
  const recorded = call.analysis.errorAttribution?.message
  if (call.permissionDecision === 'denied' || call.resultCode === 'POLICY_DENIED') {
    const decision = call.analysis.permissionComparison.actualDecision.message
    const message =
      decision && !['源日志没有记录权限判定', '权限判定未完成'].includes(decision)
        ? decision
        : recorded ||
          `策略拒绝请求；授权范围：${call.grantedScopes.join('、') || '未提供'}；请求权限：${call.requestedScopes.join('、') || '未提供'}。`
    return {
      kind: 'policy_denied',
      message: message + (call.executionStatus === 'not_executed' ? '（本次工具未执行）' : ''),
    }
  }
  if (call.executionStatus === 'succeeded') return { kind: 'succeeded', message: '调用执行成功' }
  if (call.executionStatus === 'not_executed')
    return {
      kind: 'not_executed',
      message: call.nonExecutionReason || recorded || '工具未执行，源日志未提供原因',
    }
  if (call.executionStatus === 'failed') {
    const code = call.resultCode && call.resultCode !== 'NOT_RECORDED' ? call.resultCode : ''
    const message = recorded || '源日志未提供原因'
    return {
      kind: 'failed',
      message: code && !message.includes(code) ? `${message}（错误码：${code}）` : message,
    }
  }
  return { kind: 'unknown', message: recorded || '源日志未提供原因' }
}

export const efficiencyLabel = (kind?: string) =>
  kind === 'retry'
    ? '重试（待核查）'
    : kind === 'duplicate'
      ? '重复请求（待核查）'
      : '已记录低效证据'
