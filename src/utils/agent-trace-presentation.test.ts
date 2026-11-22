import { expect, it } from 'vitest'
import { traceRiskLabel } from './agent-trace-presentation'

it('labels a model-only security finding by its source and gives rule findings precedence', () => {
  const modelRisk = { category: 'security', detectionSource: 'model_fallback' } as const
  const ruleRisk = { category: 'security', detectionSource: 'backend_rule' } as const
  const toolError = { category: 'operation', detectionSource: 'backend_rule' } as const
  expect(traceRiskLabel('risk_found', [modelRisk, toolError])).toBe('有风险(other)')
  expect(traceRiskLabel('risk_found', [modelRisk, ruleRisk])).toBe('有风险')
  expect(traceRiskLabel('no_risk_found', [toolError])).toBe('无风险')
  expect(traceRiskLabel('pending')).toBe('待审计')
})
