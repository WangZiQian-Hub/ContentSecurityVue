export interface RuleFinding {
  findingId: string
  ruleId: string
  ruleVersion: string
  category: 'security' | 'policy' | 'operation' | 'efficiency'
  label: string
  eventId: string
  eventDisplayId: string
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
