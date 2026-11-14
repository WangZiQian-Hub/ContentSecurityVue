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
  return b.name && b.name !== b.displayId
    ? `${b.name}（${b.displayId || ''}）`
    : b.displayId || '未选择'
}

const riskNames: Record<string, string> = {
  unauthorized_request: '越权请求',
  prohibited_request: '违规请求',
  external_instruction: '外部内容中有可疑指令',
  policy_denied: '请求被拦截',
  tool_timeout: '工具调用超时',
  tool_error: '工具调用出错',
  runtime_error: '运行出错',
  incomplete_execution: '任务未完成',
  recorded_retry: '调用重试',
  recorded_duplicate: '重复调用',
  repeated_request: '相同请求被多次调用',
}
const previousRiskNames: Record<string, string> = {
  '请求违反明确策略（已拦截）': '违规请求，已拦截',
  超出记录授权范围的请求: '越权请求',
  外部内容含提示注入线索: '外部内容中有可疑指令',
}
export function traceRiskName(risk: { code: string; label: string }) {
  return riskNames[risk.code] || previousRiskNames[risk.label] || risk.label
}
export function traceRiskSummary(risks: { code: string; label: string }[]) {
  const hasOverreach = risks.some((r) => r.code === 'unauthorized_request')
  return (
    [
      ...new Set(
        risks.filter((r) => !hasOverreach || r.code !== 'prohibited_request').map(traceRiskName),
      ),
    ].join('、') || '暂无风险记录'
  )
}

// Combine overlapping checks for one request, retaining every original finding in details.
export function groupTraceFindings(items: RuleFinding[] = []) {
  const groups = new Map<string, RuleFinding[]>()
  for (const item of items) {
    const family = ['security', 'policy'].includes(item.category) ? 'risk' : item.category
    const key = JSON.stringify([item.eventId, item.callId || '', family])
    groups.set(key, [...(groups.get(key) || []), item])
  }
  return [...groups.entries()].map(([key, findings]) => {
    const security = findings.filter((f) => f.category === 'security')
    const primary = security.length ? security : findings
    const outcomes = [...new Set(primary.map((f) => f.outcome))]
    return {
      key,
      items: findings,
      category: security.length ? ('security' as const) : findings[0]!.category,
      title: traceRiskSummary(primary.map((f) => ({ code: f.ruleId, label: f.label }))),
      outcome: outcomes.length === 1 ? outcomes[0]! : 'unknown',
      eventId: findings[0]!.eventId,
      eventDisplayId: findings[0]!.eventDisplayId,
      callId: findings[0]!.callId,
    }
  })
}

export function traceEvidenceText(text: string) {
  try {
    const value = JSON.parse(text)
    if (
      value &&
      typeof value === 'object' &&
      Array.isArray(value.granted) &&
      Array.isArray(value.requested) &&
      [...value.granted, ...value.requested].every((v) => typeof v === 'string')
    ) {
      return `允许的权限：${value.granted.join('、') || '未记录'}\n请求的权限：${value.requested.join('、') || '未记录'}`
    }
  } catch {
    /* Preserve source text when it is not a permission comparison. */
  }
  return text
}
