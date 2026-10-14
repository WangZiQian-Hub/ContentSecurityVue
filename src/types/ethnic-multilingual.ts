/** 多语种语义权重与风险分层的数据契约（GN21）。
 * 归属模型服务（8001），路由前缀 /api/v1/analysis/ethnic-multilingual。
 * 前端按本契约渲染；后端未就绪时由 src/mock/ethnic-multilingual.ts 提供固定样例。
 */

/** 分析模式：
 * - semantic_weighting：语义权重建模（重点解释安全/中性/风险语义权重）
 * - risk_tiering：风险分层识别（重点解释风险分层依据）
 * 两种模式返回结构一致，仅模型分析重点不同。
 */
export type MultilingualAnalysisMode = 'semantic_weighting' | 'risk_tiering'

/** 风险档位：安全 / 低风险 / 中风险 / 高风险 / 未知（无有效样本时后端返回 unknown）。 */
export type MultilingualRiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'unknown'

/** 逐样本处理状态：已评估 / 无法评估。 */
export type MultilingualSampleStatus = 'assessed' | 'unassessable'

/** 分析任务状态。 */
export type MultilingualTaskStatus = 'pending' | 'running' | 'succeeded' | 'failed'

/** 方案 ID（当前仅一个方案）。 */
export type MultilingualSchemeId = 'multilingual-v1'

/** 语义权重：安全 / 中性 / 风险，三项合计为 1。 */
export interface SemanticWeights {
  safe: number
  neutral: number
  risk: number
}

/** 单条语义证据（引用原文连续片段 + 判断原因）。 */
export interface SemanticEvidence {
  quote: string
  reason: string
}

/** 分析范围（任务输入）。创建任务与结果查询共用。 */
export interface MultilingualScope {
  /** 数据集 ID（正整数）。 */
  datasetId: number
  /** 数据集版本，须与业务库 datasets.version 一致。 */
  versionId: string
  /** 分析语种：1～32 个不重复语言代码（如 zh、en、ug、bo）。 */
  languages: string[]
  analysisMode: MultilingualAnalysisMode
  /** 可省略，默认 multilingual-v1。 */
  schemeId: MultilingualSchemeId
}

/** 创建分析任务请求体。 */
export interface CreateMultilingualTaskReq {
  modelId: string
  input: MultilingualScope
}

/** 分析任务。建单与状态查询返回结构一致。 */
export interface MultilingualTask {
  taskId: string
  status: MultilingualTaskStatus
  /** 成功后可用其查询结果；未完成时为 null。 */
  resultId: string | null
  input: MultilingualScope
  modelId: string
  createdAt: string
  /** 失败时的错误说明；正常为 null。 */
  errorMessage: string | null
}

/** 风险分档阈值（边界值归入较高档）。 */
export interface MultilingualThresholds {
  low: number
  medium: number
  high: number
}

/** 语种分布条目：该语种样本数及安全/中性/风险语义权重（百分比，0～100）。 */
export interface LanguageDistributionItem {
  language: string
  sampleCount: number
  safeWeight: number
  neutralWeight: number
  riskWeight: number
}

/** 风险分层分布条目：档位数量及占比。 */
export interface RiskDistributionItem {
  level: MultilingualRiskLevel
  count: number
  percent: number
}

/** 风险证据条目（最多 20 条）。 */
export interface RiskEvidenceItem {
  sampleId: string
  language: string
  /** 原文连续片段。 */
  quote: string
  /** 判断原因。 */
  reason: string
  /** 风险语义权重（0～1）。 */
  semanticWeight: number
  /** 风险分数（0～1）。 */
  riskScore: number
  riskLevel: MultilingualRiskLevel
}

/** 逐条样本（结果详情）。 */
export interface MultilingualSample {
  id: string
  datasetId: number
  versionId: string
  revisionId: string
  /** 遮蔽后的文本。 */
  text: string
  language: string
  status: MultilingualSampleStatus
  /** 语义权重；无法评估时为 null。 */
  semanticWeights: SemanticWeights | null
  /** 风险分数；无法评估时为 null。 */
  riskScore: number | null
  riskLevel: MultilingualRiskLevel
  /** 标准档位，仅原记录有标准档位时出现。 */
  referenceRiskLevel?: MultilingualRiskLevel
  evidence: SemanticEvidence[]
  /** 无法评估的原因，仅 status=unassessable 时出现。 */
  unassessableReason?: string
}

/** 分析结果汇总（结果详情、最近结果、历史结果的条目结构）。 */
export interface MultilingualResult {
  id: string
  taskId: string
  scope: MultilingualScope
  datasetName: string
  modelId: string
  finishedAt: string
  /** 数据来源：business_dataset / mock。 */
  dataSource: string
  schemeName: string
  thresholds: MultilingualThresholds
  /** 目标样本数。 */
  targetCount: number
  /** 有效（已评估）样本数。 */
  validCount: number
  /** 无法评估样本数。 */
  unassessableCount: number
  /** 模型处理失败样本数。 */
  failedCount: number
  /** 预测档位与标准档位相同的样本数。 */
  accuracyCorrectCount: number
  /** 本次选中且带标准档位的样本数。 */
  accuracyTestCount: number
  /** 数据权重判别准确率（0～1，保留四位小数；无标准档位样本时为 null）。
   *  前端展示时乘以 100 得到百分比。 */
  dataWeightClassificationAccuracy: number | null
  /** 综合风险分数（0～1）；无有效样本时为 null。 */
  overallRiskScore: number | null
  overallRiskLevel: MultilingualRiskLevel
  /** 跨语种语义一致性（0～1）；不足两个有效语种时为 null。 */
  semanticConsistency: number | null
  /** 一致性计算方法（可选）。 */
  semanticConsistencyMethod?: string
  /** 高风险语义权重（百分比，0～100）；无有效样本时为 null。 */
  highRiskSemanticWeight: number | null
  /** 有效样本覆盖的语言数。 */
  coveredLanguageCount: number
  languageDistribution: LanguageDistributionItem[]
  riskDistribution: RiskDistributionItem[]
  riskEvidence: RiskEvidenceItem[]
  /** 相对同范围同模型上次结果的变化；无基线时为 null。 */
  semanticConsistencyDelta: number | null
  highRiskSemanticWeightDelta: number | null
}

/* ------------------------------------------------------------------ */
/* 展示文案映射（前端只做枚举 → 中文标签，不改变数据）                    */
/* ------------------------------------------------------------------ */

/** 风险档位中文文案。 */
export const multilingualRiskLevels: Record<MultilingualRiskLevel, string> = {
  safe: '安全',
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  unknown: '未评估',
}

/** 分析模式中文文案。 */
export const multilingualAnalysisModes: Record<MultilingualAnalysisMode, string> = {
  semantic_weighting: '语义权重建模',
  risk_tiering: '风险分层识别',
}

/** 常用语言代码 → 中文名称；未命中时代码原样展示。 */
export const languageNames: Record<string, string> = {
  zh: '中文',
  en: '英文',
  ug: '维吾尔语',
  bo: '藏语',
  ar: '阿拉伯语',
  ru: '俄语',
  ja: '日语',
  ko: '韩语',
  fr: '法语',
  de: '德语',
  es: '西班牙语',
  pt: '葡萄牙语',
  tr: '土耳其语',
  hi: '印地语',
}

/** 获取语言的展示名称。 */
export function languageName(code: string): string {
  return languageNames[code] ?? code
}

/** 风险档位标签颜色标记（配合组件内的 el-tag 类型）。 */
export const riskLevelTagType: Record<MultilingualRiskLevel, 'success' | 'info' | 'warning' | 'danger' | 'primary'> = {
  safe: 'success',
  low: 'primary',
  medium: 'warning',
  high: 'danger',
  unknown: 'info',
}

/** 风险档位主题色（用于环形图、权重条）。 */
export const riskLevelColors: Record<Exclude<MultilingualRiskLevel, 'unknown'>, string> = {
  safe: '#34c77b',
  low: '#3b82f6',
  medium: '#f59e0b',
  high: '#f56c6c',
}

/** 语义权重三色：安全（绿）、中性（蓝）、风险（红）。 */
export const semanticWeightColors = {
  safe: '#34c77b',
  neutral: '#3b82f6',
  risk: '#f56c6c',
}
