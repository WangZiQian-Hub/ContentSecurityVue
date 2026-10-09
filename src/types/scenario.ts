import type { Task } from './index'

/** 场景应用的接口契约（对应模型服务 8001 的 /analysis/*）。
 *
 * 字段命名：模型服务返回的多数 DTO 使用 snake_case，经请求层统一转换后
 * 在组件里以 camelCase 使用。请求体同样由请求层转回 snake_case。
 */

/** 文档第 4.1 节的六个场景编码。 */
export type ScenarioCode =
  | 'public_opinion'
  | 'hot_events'
  | 'cross_cultural'
  | 'ethnic_governance'
  | 'smart_government'
  | 'cyber_security'

/** 场景风险等级为小写四档，与风险治理的大写等级不是同一套。 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'unknown'

/** 仅舆情场景返回。 */
export type Sentiment = 'positive' | 'negative' | 'neutral' | 'mixed' | 'unknown'

/** sourceId 为 input 时表示请求正文，否则必须对应 materials 的 id。 */
export interface Citation {
  sourceId: string
  quote: string
}

/** 论断：evidence 至少一条，不是字符串数组。 */
export interface Claim {
  text: string
  evidence: Citation[]
}

/** 仅热点场景返回；同一份材料的 id 与 time 必须对应同一条输入材料。 */
export interface TimelineItem {
  text: string
  evidence: Citation[]
  sourceId: string
  time: string
}

/** 仅跨文化场景返回；未传目标语言时为 null。 */
export interface Translation {
  targetLanguage: string
  text: string
}

/** 参考材料。id 不能为保留值 input。 */
export interface ScenarioMaterial {
  id: string
  content: string
  title?: string
  time?: string
}

export interface PublicOpinionDetails {
  type: 'public_opinion'
  issues: Claim[]
  sentiment: Sentiment
  sentimentEvidence: Citation[]
  controversies: Claim[]
  communicationAdvice: string[]
}

export interface HotEventsDetails {
  type: 'hot_events'
  eventSummary: string
  timeline: TimelineItem[]
  focalPoints: Claim[]
  contradictions: Claim[]
  informationGaps: string[]
  /** 至少需要两份带时间的材料才能推断，否则为 null。 */
  trend: Claim | null
}

export interface CrossCulturalDetails {
  type: 'cross_cultural'
  culturalContexts: Claim[]
  ambiguities: Claim[]
  expressionSuggestions: string[]
  translation: Translation | null
}

export interface EthnicGovernanceDetails {
  type: 'ethnic_governance'
  issues: Claim[]
  misunderstandings: Claim[]
  conflictExpressions: Claim[]
  coordinationAdvice: string[]
}

export interface SmartGovernmentDetails {
  type: 'smart_government'
  answer: string
  policyClaims: Claim[]
  processingPoints: Claim[]
  insufficientMaterials: boolean
}

export interface CyberSecurityDetails {
  type: 'cyber_security'
  riskTypes: Claim[]
  suspiciousSigns: Claim[]
  handlingAdvice: string[]
}

export type ScenarioDetails =
  | PublicOpinionDetails
  | HotEventsDetails
  | CrossCulturalDetails
  | EthnicGovernanceDetails
  | SmartGovernmentDetails
  | CyberSecurityDetails

/** 场景分析结果：六套 details 之外的共同字段完全一致。 */
export interface ScenarioResult {
  scenarioCode: ScenarioCode
  summary: string
  riskLevel: RiskLevel
  evidence: Citation[]
  recommendations: string[]
  limitations: string[]
  /** 为 true 时风险等级必为 unknown，且结论不可用。 */
  insufficientMaterials: boolean
  details: ScenarioDetails
}

/** 一次阶段调用的关联信息。 */
export interface AnalysisCallRef {
  stage: string
  callId: string
  status: 'success' | 'error'
  errorCode: string | null
}

/** 场景、生成治理、审计三类分析共用的记录结构（文档第 7 节）。 */
export interface AnalysisRecord {
  id: string
  kind: 'scenario' | 'model_governance' | 'audit' | string
  scenarioCode: string | null
  modelId: string
  input: Record<string, unknown>
  createdAt: string
  status: 'running' | 'succeeded' | 'failed'
  stage: string | null
  /** 失败时为 null；此时不要当作成功处理。 */
  result: ScenarioResult | null
  originalOutput: string | null
  calls: AnalysisCallRef[]
  errorCode: string | null
  errorMessage: string | null
  elapsedMs: number
  finishedAt: string | null
  upstreamStatus?: number
}

/** 模型目录条目（文档第 3.1 节）；不返回 api_key，也没有写接口。 */
export interface ScenarioModel {
  modelId: string
  upstreamModelId: string
  name: string
  description: string | null
  baseUrl: string
  createdAt: string
  updatedAt: string
}

/** 前端一次场景分析的最终产物。
 *
 * llm 模式带回模型服务的完整结果；backend 模式只有业务后端的通用任务，
 * 其 result 结构不足以渲染分析结果，由页面回退为原始结果展示。
 */
export type ScenarioOutcome =
  | { mode: 'llm'; result: ScenarioResult | null; record: AnalysisRecord }
  | { mode: 'backend'; task: Task }

export const scenarioLabels: Record<ScenarioCode, string> = {
  public_opinion: '舆情分析',
  hot_events: '热点事件跟踪',
  cross_cultural: '跨文化交流',
  ethnic_governance: '多民族社会治理',
  smart_government: '智能政务',
  cyber_security: '网络空间安防',
}

export const riskLabels: Record<RiskLevel, string> = {
  low: '低',
  medium: '中',
  high: '高',
  unknown: '未知',
}

export const sentimentLabels: Record<Sentiment, string> = {
  positive: '正面',
  negative: '负面',
  neutral: '中立',
  mixed: '混合',
  unknown: '未知',
}

/** 把路由页签名转换成文档要求的场景编码；无法识别时返回空串。 */
export function toScenarioCode(tab: unknown): ScenarioCode | '' {
  const code = String(tab ?? '').replaceAll('-', '_')
  return code in scenarioLabels ? (code as ScenarioCode) : ''
}
