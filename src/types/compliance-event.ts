/** 训练中合规事件监控的数据契约（GN18-19）。
 * 事件在训练过程中产生，归属业务后端训练任务域；前端按本契约渲染，
 * 未接入后端时由 src/mock/compliance-events.ts 提供固定样例。
 */

/** 事件风险级别：高 / 中 / 低。 */
export type ComplianceEventLevel = 'high' | 'medium' | 'low'

/** 事件处置状态：
 * - recorded：已记录（等待人工确认）
 * - blocked：已拦截（安全策略自动拦截）
 * - handled：已处置（人工处理完成）
 * - ignored：已忽略（低风险误报，确认无需处理）
 */
export type ComplianceEventStatus = 'recorded' | 'blocked' | 'handled' | 'ignored'

/** 单条合规事件。 */
export interface ComplianceEvent {
  id: string
  /** 事件发生时间（ISO 字符串，页面只展示时分秒）。 */
  time: string
  /** 事件类型，如“敏感样本触发”。 */
  eventType: string
  level: ComplianceEventLevel
  status: ComplianceEventStatus
  /** 事件详情（可选，用于全部记录弹窗补充说明）。 */
  detail?: string
}

/** 监控面板顶部的三项汇总。汇总口径由后端计算，前端直接展示。 */
export interface ComplianceEventSummary {
  /** 累计事件数。 */
  total: number
  /** 高风险事件数（未处理）。 */
  highRisk: number
  /** 已处置事件数（含已拦截、已处置）。 */
  handled: number
}

/** 监控面板一次性读取的概览数据。 */
export interface ComplianceEventOverview {
  summary: ComplianceEventSummary
  /** 最近事件记录（页面展示最近 3 条）。 */
  recentEvents: ComplianceEvent[]
}

/** 级别展示文案及标签样式标记。 */
export const complianceEventLevels: Record<ComplianceEventLevel, string> = {
  high: '高风险',
  medium: '中风险',
  low: '低风险',
}

/** 状态展示文案。 */
export const complianceEventStatuses: Record<ComplianceEventStatus, string> = {
  recorded: '已记录',
  blocked: '已拦截',
  handled: '已处置',
  ignored: '已忽略',
}

/** 事件时间只显示“时:分:秒”。 */
export function formatEventTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleTimeString('zh-CN', { hour12: false })
}
