import type { ResourceRow, Task } from '../types'
export const tasks: Task[] = [
  {
    taskId: 'tsk_20260922_092100_ab12cd',
    name: '高价值语料挖掘任务',
    taskCategory: '数据治理',
    capabilityCode: 'high_value_detect',
    status: 'running',
    createdAt: '2026-09-22T09:21:00+08:00',
  },
  {
    taskId: 'tsk_20260922_081500_ef34ab',
    name: '异常数据识别分析',
    taskCategory: '风险治理',
    capabilityCode: 'anomaly_detect',
    status: 'succeeded',
    createdAt: '2026-09-22T08:15:00+08:00',
  },
  {
    taskId: 'tsk_20260921_164300_cd56ef',
    name: '大模型语义风险评估',
    taskCategory: '测试评估',
    capabilityCode: 'evaluation',
    status: 'running',
    createdAt: '2026-09-21T16:43:00+08:00',
  },
  {
    taskId: 'tsk_20260921_142000_ab78cd',
    name: '投毒链路追踪分析',
    taskCategory: '风险治理',
    capabilityCode: 'poison_trace',
    status: 'pending',
    createdAt: '2026-09-21T14:20:00+08:00',
  },
  {
    taskId: 'tsk_20260921_113600_ef90ab',
    name: '多语言语料库构建',
    taskCategory: '数据资源',
    capabilityCode: 'data_ingest',
    status: 'succeeded',
    createdAt: '2026-09-21T11:36:00+08:00',
  },
]
const names: Record<string, string[]> = {
  datasets: [
    '内容安全多模态数据集',
    '跨文化交流高价值语料',
    '行业风险标注数据集',
    '多语言公共测试集',
    '政务知识增强语料',
  ],
  models: ['内容安全识别模型', '多模态审核模型', '舆情分析大模型', '文本向量模型', '图像识别模型'],
  metrics: [
    '数据准确性',
    '数据时效性',
    '风险识别准确率',
    '风险召回率',
    '合规符合率',
    '敏感内容过滤',
    '生成内容安全性',
    '鲁棒性',
  ],
  alerts: ['推理内容风险', '训练数据异常', '模型行为异常', '输入内容风险', '输出合规风险'],
  users: ['张三', '李晓', '王明', '赵敏'],
  roles: ['系统管理员', '数据管理员', '模型工程师', '审计员'],
  logs: ['输入参数记录', '能力路由记录', '算法调用记录', '任务结果记录'],
  'test-records': [
    '数据准确性测试',
    '敏感内容过滤测试',
    '风险识别准确率测试',
    '合规符合率测试',
    '生成内容安全性测试',
  ],
}
export function getMockResources(resource: string): ResourceRow[] {
  return (names[resource] || names.datasets || []).map((name, index) => ({
    id: index + 1,
    name,
    category:
      resource === 'models'
        ? ['文本分类', '多模态', '生成式', '向量模型', '图像分类'][index] || '通用'
        : ['数据价值', '数据治理', '风险识别', '合规治理', '模型能力'][index % 5] || '通用',
    version: `v1.${index}.0`,
    status: index === 3 ? 'pending' : 'succeeded',
    description:
      ['支持多源数据接入与安全分析', '面向内容安全的标准化处理', '全流程追踪与评估验证'][
        index % 3
      ] || '',
  }))
}
