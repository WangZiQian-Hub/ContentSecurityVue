import type { ComplianceEvent, ComplianceEventOverview } from '../types/compliance-event'

/** 训练中合规事件监控的固定样例（GN18-19）。
 * 事件类型、级别、状态为固定内容；时间按当前时刻回推，保证演示时不会出现“未来时间”。
 */

/** 生成“距今 n 分 m 秒”的 ISO 时间。 */
function minutesAgo(min: number, sec = 0): string {
  return new Date(Date.now() - min * 60_000 - sec * 1000).toISOString()
}

/** 全部样例事件（与累计事件数保持一致，共 3 条）。 */
export function createComplianceEvents(): ComplianceEvent[] {
  return [
    {
      id: 'CE-DEMO-001',
      time: minutesAgo(5, 39),
      eventType: '敏感样本触发',
      level: 'high',
      status: 'recorded',
      detail: '训练样本命中敏感词规则，已记录待人工确认。',
    },
    {
      id: 'CE-DEMO-002',
      time: minutesAgo(17, 57),
      eventType: '训练数据越权访问尝试',
      level: 'medium',
      status: 'blocked',
      detail: '训练进程尝试访问未授权的数据分片，已被安全策略拦截。',
    },
    {
      id: 'CE-DEMO-003',
      time: minutesAgo(29, 44),
      eventType: '模型输出异常告警',
      level: 'low',
      status: 'recorded',
      detail: '模型输出分布异常，已记录观察。',
    },
  ]
}

/** 监控面板概览。
 * 说明：汇总口径由后端计算（“已处置”包含已拦截、已处置等终态）；
 * 样例中使用固定汇总值，与效果图保持一致，接入后端以后端返回为准。
 */
export function createComplianceEventOverview(): ComplianceEventOverview {
  const events = createComplianceEvents()
  return {
    summary: { total: 3, highRisk: 1, handled: 2 },
    recentEvents: events.slice(0, 3),
  }
}
