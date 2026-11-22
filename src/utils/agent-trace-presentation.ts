export interface RuleFinding {
  competitionStep?: number
  findingId: string
  ruleId: string
  ruleVersion: string
  detectionSource?: string
  modelProvider?: 'deepseek' | 'internlm'
  modelId?: string
  category: 'security' | 'policy' | 'operation' | 'efficiency'
  label: string
  eventId: string | null
  eventDisplayId: string | null
  callId?: string | null
  outcome: string
  evidenceText: string
}
export interface RuleAuditSummary {
  version: string
  scope: string
  totalSamples: number
  completedSamples: number
  pendingSamples: number
  securitySamples: number
  policySamples: number
  operationSamples: number
  efficiencySamples: number
}
export function traceBatchLabel(b?: { name?: string; displayId?: string } | null) {
  if (!b) return '未选择'
  return b.name && b.name !== b.displayId ? `${b.name}（${b.displayId || ''}）` : b.displayId || '未选择'
}

export function traceRiskLabel(
  decision: string,
  findings: Pick<RuleFinding, 'category' | 'detectionSource'>[] = [],
) {
  if (decision === 'no_risk_found') return '无风险'
  if (decision === 'risk_found') {
    const security = findings.filter((finding) => finding.category === 'security')
    return security.length && security.every((finding) => finding.detectionSource === 'model_fallback')
      ? '有风险(other)'
      : '有风险'
  }
  return decision === 'error' ? '审计失败' : '待审计'
}
