import type { ComplianceTab, VerificationState } from '../../types/compliance'
export const tabs: { path: ComplianceTab; title: string; icon: string }[] = [
  { path: '', title: '审计总览', icon: 'Grid' },
  { path: 'lineage', title: '数据谱系追踪', icon: 'Coin' },
  { path: 'training-monitor', title: '训练行为监控', icon: 'DataAnalysis' },
  { path: 'reasoning-audit', title: '推理路径审计', icon: 'Share' },
  { path: 'neuron-audit', title: '神经元激活审计', icon: 'Connection' },
  { path: 'risk-alert', title: '合规风险预警', icon: 'Warning' },
  { path: 'full-chain', title: '全链路追踪', icon: 'Shield' },
]
export const labels: Record<string, string> = {
  verified: '已核验',
  missing: '待补证',
  unavailable: '不可用',
  not_applicable: '不适用',
  unknown: '未知',
  pending: '待复核',
  confirmed: '已确认',
  rejected: '已驳回',
  needs_evidence: '需补证',
  processing: '处理中',
  resolved: '已关闭',
  high: '高风险',
  medium: '中风险',
  low: '低风险',
  advisory: '提示',
  normal: '正常',
  risk: '风险',
  alarm: '告警',
  succeeded: '执行成功',
  running: '执行中',
  failed: '执行失败',
  cancelled: '已取消',
}
export const formatCount = (value: number | null | undefined) =>
  value == null ? '未知' : value.toLocaleString('zh-CN')
export const formatTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '未记录'
export function stateType(
  state: string | null | undefined,
): 'success' | 'warning' | 'danger' | 'info' | 'primary' {
  return state === 'verified' || state === 'confirmed' || state === 'resolved'
    ? 'success'
    : state === 'missing' || state === 'processing' || state === 'medium'
      ? 'warning'
      : state === 'high' || state === 'risk' || state === 'alarm' || state === 'failed'
        ? 'danger'
        : 'info'
}
export const verificationLabel = (state: VerificationState) => labels[state]
