import { executeTask } from './task'
import { getTaskCategory } from '../utils/enums'
// 统一平台入口；前端不得直接调用课题 adapter。每个函数保留显式 return。
export const CAPABILITIES = [
  {
    code: 'data_ingest',
    label: '数据接入',
    route: '/data-resource/ingest',
    input: { datasetName: '新数据集', sourceType: 'business', languages: ['zh'], datasetId: 1 },
  },
  {
    code: 'value_score',
    label: '多维价值评分',
    route: '/data-governance/value-analysis',
    input: { datasetId: 1 },
  },
  {
    code: 'high_value_detect',
    label: '高价值语料发现',
    route: '/data-governance/value-analysis',
    input: { datasetId: 1, topN: 10, threshold: 0.8 },
  },
  {
    code: 'causal_trace',
    label: '因果追踪',
    route: '/data-governance/value-analysis',
    input: { datasetId: 1, target: '高价值语料' },
  },
  {
    code: 'data_risk_weight',
    label: '风险权重评估',
    route: '/data-governance/anomaly',
    input: { datasetId: 1 },
  },
  {
    code: 'provenance_trace',
    label: '数据溯源链路',
    route: '/compliance/lineage',
    input: { datasetId: 1 },
  },
  {
    code: 'anomaly_detect',
    label: '异常识别',
    route: '/data-governance/anomaly',
    input: { datasetId: 1, threshold: 0.7 },
  },
  {
    code: 'poison_trace',
    label: '投毒链路追踪',
    route: '/data-governance/anomaly',
    input: { datasetId: 1 },
  },
  {
    code: 'anomaly_repair',
    label: '异常样本修复',
    route: '/data-governance/anomaly',
    input: { itemId: 1, anomalyType: 'format_error' },
  },
  {
    code: 'semantic_risk',
    label: '语义风险识别',
    route: '/data-governance/risk-classification',
    input: { content: '今天天气很好。', language: 'zh' },
  },
  {
    code: 'risk_knowledge',
    label: '风险知识库检索',
    route: '/data-governance/risk-classification',
    input: { query: '隐私泄露', topK: 5, mode: 'hybrid' },
  },
  {
    code: 'knowledge_edit',
    label: '模型知识编辑',
    route: '/model-train/evaluation',
    input: { modelId: 1, targetKnowledge: '待编辑知识', editType: 'replace' },
  },
  {
    code: 'model_risk_governance',
    label: '模型安全治理',
    route: '/model-train/invoke',
    input: { modelId: 1, prompt: '请介绍内容安全治理。', params: { temp: 0.7, maxLen: 1024 } },
  },
  {
    code: 'lineage_audit',
    label: '数据谱系审计',
    route: '/compliance/lineage',
    input: { datasetId: 1 },
  },
  {
    code: 'training_monitor',
    label: '训练合规监控',
    route: '/compliance/training-monitor',
    input: { trainingTaskId: 'demo-training-001' },
  },
  {
    code: 'reasoning_audit',
    label: '推理路径审计',
    route: '/compliance/reasoning-audit',
    input: { modelId: 1, input: '今天天气怎么样？' },
  },
  {
    code: 'neuron_audit',
    label: '神经元激活审计',
    route: '/compliance/neuron-audit',
    input: { modelId: 1, layer: 16 },
  },
  {
    code: 'full_chain_audit',
    label: '全链路追踪',
    route: '/compliance/full-chain',
    input: { datasetId: 1 },
  },
  {
    code: 'scenario_governance',
    label: '场景主动干预',
    route: '/scenario/public-opinion',
    input: { scenarioCode: 'public_opinion', content: '待分析的场景内容' },
  },
  {
    code: 'evaluation',
    label: '指标测试评估',
    route: '/evaluation/execution',
    input: { metricCodes: ['data_accuracy'], datasetId: 1, modelId: 1 },
  },
] satisfies { code: string; label: string; route: string; input: Record<string, unknown> }[]
export type CapabilityCode = (typeof CAPABILITIES)[number]['code']
export function invokeCapability(capabilityCode: CapabilityCode, input: Record<string, unknown>) {
  return executeTask({
    capabilityCode,
    name: CAPABILITIES.find((item) => item.code === capabilityCode)?.label,
    taskCategory: getTaskCategory(capabilityCode),
    input,
  })
}
