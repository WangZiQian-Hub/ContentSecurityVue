import { describe, expect, it } from 'vitest'
import { mapKeys } from './case'
import { CAPABILITIES } from '../api/capability'
import { navigation } from '../router/navigation'
describe('接口字段契约', () => {
  it('递归转换字段，保留能力编码和枚举值', () => {
    const input = {
      capabilityCode: 'semantic_risk',
      input: { datasetId: 1, metricCodes: ['data_accuracy'] },
      riskLevel: 'high',
    }
    expect(mapKeys(input, 'snake')).toEqual({
      capability_code: 'semantic_risk',
      input: { dataset_id: 1, metric_codes: ['data_accuracy'] },
      risk_level: 'high',
    })
    expect(mapKeys(mapKeys(input, 'snake'), 'camel')).toEqual(input)
  })
  it('保留 null 和基础类型', () => {
    expect(mapKeys([null, true, 12, 'training_monitor'], 'snake')).toEqual([
      null,
      true,
      12,
      'training_monitor',
    ])
  })
  it('20 个能力编码唯一且入口可访问', () => {
    expect(CAPABILITIES).toHaveLength(20)
    expect(new Set(CAPABILITIES.map((item) => item.code)).size).toBe(20)
    for (const item of CAPABILITIES) {
      const module = navigation.find((nav) => item.route.startsWith(nav.path + '/'))
      expect(module?.tabs.some((tab) => `${module.path}/${tab.path}` === item.route)).toBe(true)
    }
  })
})
