import type { SourceContext, Threshold, Unit } from '../../types/evaluation'
export const categories = {
  data_value: '数据价值',
  data_governance: '数据治理',
  risk_detect: '风险识别',
  compliance: '合规治理',
  model_capability: '模型能力',
}
export const labels: Record<string, string> = {
  calculating: '指标计算',
  dataset_version: '数据版本',
  label_version: '标签版本',
  source_results: '来源结果',
  pending: '待启动',
  running: '运行中',
  succeeded: '执行完成',
  failed: '失败',
  cancelled: '已取消',
  passed: '已达标',
  inconclusive: '无法判定',
  not_evaluated: '尚未判定',
  draft: '草稿',
  published: '已发布',
  needs_definition: '待完善',
  enabled: '已启用',
  disabled: '已停用',
  midterm: '中期',
  final: '完成期',
  automatic: '自动计算',
  paired: '前后对照',
  evidence: '证据核验',
  complete: '完整',
  incomplete: '不完整',
  corrupt: '校验失败',
  queued: '排队中',
  frozen: '版本已冻结',
  archived: '结果已归档',
  input: '输入',
  route: '路由',
  invoke: '执行',
  output: '输出',
  time: '时间',
  interface: '接口',
  version: '版本',
  success: '完成',
  failure: '异常',
  real: '真实算法',
  llm: '大模型替代',
  mock: '模拟算法',
  zero_denominator: '分母为零',
  labels_missing: '标准标签缺失',
  pairing_failed: '前后结果无法配对',
  evidence_missing: '必要证据缺失',
  stage_target_missing: '未设阶段目标',
  reference: '引用已有结果',
  rerun: '重新运行能力',
}
export const label = (value: string | null | undefined) => (value ? labels[value] || value : '—')
export const time = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—'
export function measure(value: number | null | undefined, unit: Unit = 'ratio'): string {
  if (value == null) return '—'
  return unit === 'ratio'
    ? `${(value * 100).toLocaleString('zh-CN', { maximumFractionDigits: 4 })}%`
    : unit === 'boolean'
      ? value === 1
        ? '全部满足'
        : '未全部满足'
      : value.toLocaleString('zh-CN')
}
export function threshold(value: Threshold | null | undefined): string {
  return value
    ? `${{ gte: '≥', lte: '≤', eq: '=', all: '' }[value.comparator]}${measure(value.value, value.unit)}`
    : '未设定'
}
export function sourceLink(source: SourceContext): string | null {
  const paths: Record<string, string> = {
    'data-resource': '/data-resource/datasets',
    data_value: '/data-governance/value-analysis',
    'value-analysis': '/data-governance/value-analysis',
    anomaly: '/data-governance/anomaly',
    'risk-classification': '/data-governance/risk-classification',
    risk_detect: '/data-governance/risk-classification',
    'data-governance': '/data-governance/process',
    scenario: '/scenario',
    'model-train': '/model-train/management',
  }
  if (source.sourceModule === 'model-train' && source.modelId)
    return `/model-train/management?modelId=${encodeURIComponent(source.modelId)}`
  if (source.sourceModule === 'compliance') {
    if (!source.sourceTaskId || source.sourceTraceId !== source.taskTraceId) return null
    return `/compliance/full-chain?sourceKind=task&taskId=${encodeURIComponent(source.sourceTaskId)}&traceId=${encodeURIComponent(source.sourceTraceId)}`
  }
  return paths[source.sourceModule] || null
}
