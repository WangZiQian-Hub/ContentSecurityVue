import type { Assessment } from '../../types/assessment'
import type { ModelCall } from '../../types/model-workbench'

type GovernanceCall = Pick<ModelCall, 'status' | 'riskLevel' | 'originalOutput' | 'governedOutput'> & Assessment
type TagType = 'success' | 'warning' | 'danger' | 'info'

/** 历史记录没有独立复检凭据，文本发生变化仅表明已改写，不能据此宣称安全。 */
export function governanceResult(call: GovernanceCall) {
  const triggered = call.riskLevel === 'high' || call.riskLevel === 'medium'
  const result = (label: string, type: TagType, message: string) => ({
    label,
    type,
    message,
    triggered,
  })
  if (call.assessmentStatus === 'unavailable')
    return result('无法判断', 'warning', call.assessmentReason || '资料不足，无法判断；尚未确认治理效果。')
  if (call.status === 'failed' || call.status === 'cancelled')
    return result('治理失败', 'danger', '本次调用未完成，请查看失败原因并重新调用。')
  if (
    call.status !== 'succeeded' ||
    !['high', 'medium', 'low'].includes(call.riskLevel) ||
    !call.originalOutput?.trim() ||
    !call.governedOutput?.trim()
  )
    return result('待复核', 'warning', '风险或输出记录不完整，不能确认治理结果。')
  const changed = call.originalOutput.trim() !== call.governedOutput.trim()
  if (triggered && !changed)
    return result('治理未完成', 'danger', '已检测到风险，但正文未作处理，请重新调用或人工复核。')
  if (changed)
    return result(
      '已改写',
      'warning',
      '请结合判定依据核对处理效果；内容变化不代表所有风险均已消除。',
    )
  return result('低风险，未改写', 'info', '模型将原始输出判为低风险，正文保持不变。')
}

export function originalRiskType(level: string): TagType {
  return level === 'high' ? 'danger' : level === 'medium' ? 'warning' : 'info'
}
