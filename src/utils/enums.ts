export const TASK_STATUS = {
  pending: { label: '待启动', color: 'info' },
  running: { label: '进行中', color: 'primary' },
  succeeded: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'danger' },
  cancelled: { label: '已取消', color: 'info' },
} as const

/** 根据能力编码统一生成任务类别，供所有任务创建入口复用。 */
export const TASK_CATEGORY = {
  data_ingest: '数据资源',
  value_score: '数据治理',
  high_value_detect: '数据治理',
  causal_trace: '风险治理',
  data_risk_weight: '风险治理',
  provenance_trace: '风险治理',
  anomaly_detect: '风险治理',
  poison_trace: '风险治理',
  anomaly_repair: '风险治理',
  semantic_risk: '风险治理',
  risk_knowledge: '风险治理',
  knowledge_edit: '风险治理',
  model_risk_governance: '模型治理',
  lineage_audit: '合规审计',
  training_monitor: '模型治理',
  reasoning_audit: '合规审计',
  neuron_audit: '合规审计',
  full_chain_audit: '合规审计',
  scenario_governance: '场景应用',
  evaluation: '测试评估',
} as const

export function getTaskCategory(capabilityCode: string): string {
  return TASK_CATEGORY[capabilityCode as keyof typeof TASK_CATEGORY] || '其他'
}
