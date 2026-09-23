import type { Kpi } from '../types'

type KpiKind =
  | 'dashboard'
  | 'governance'
  | 'model'
  | 'compliance'
  | 'evaluation'
  | 'resource'
  | 'system'

const icons = ['Coin', 'Document', 'WarningFilled', 'Box', 'CircleCheckFilled', 'PieChart']

const rawKpis: Record<KpiKind, Array<[string, number, string]>> = {
  dashboard: [
    ['数据资源总量', 12560, 'TB'],
    ['高价值语料数量', 2318, '万条'],
    ['风险数据数量', 86.5, '万条'],
    ['在管模型数量', 42, '个'],
    ['累计治理任务', 12680, '个'],
    ['测试完成率', 92.3, '%'],
  ],
  governance: [
    ['数据处理任务数', 2680, '个'],
    ['高价值语料占比', 68.5, '%'],
    ['异常数据占比', 3.2, '%'],
    ['风险识别准确率', 95.6, '%'],
  ],
  model: [
    ['在管模型数量', 56, '个'],
    ['训练任务数', 128, '次'],
    ['部署服务数', 36, '个'],
    ['模型调用次数', 125.6, '万次'],
    ['平均响应时延', 320, 'ms'],
  ],
  compliance: [
    ['合规事件总数', 12680, '个'],
    ['告警数量', 342, '条'],
    ['风险节点总数', 186, '个'],
    ['追踪覆盖率', 98.6, '%'],
    ['审计完成率', 96.3, '%'],
  ],
  evaluation: [
    ['测试项总数', 1280, '个'],
    ['已完成测试', 980, '个'],
    ['通过率', 92.3, '%'],
    ['平均耗时', 2.6, '小时'],
    ['留痕完整率', 98.7, '%'],
  ],
  resource: [
    ['数据集总数', 128, '个'],
    ['数据资源总量', 12560, 'TB'],
    ['接入数据源', 36, '个'],
    ['数据可用率', 98.2, '%'],
  ],
  system: [
    ['平台用户', 128, '人'],
    ['角色数量', 6, '个'],
    ['已接入模型', 12, '个'],
    ['服务可用率', 99.9, '%'],
  ],
}

export function getMockKpis(kind: string): Kpi[] {
  const safeKind: KpiKind = kind in rawKpis ? (kind as KpiKind) : 'dashboard'

  return rawKpis[safeKind].map(([label, value, unit], index) => ({
    id: `${safeKind}-${index + 1}`,
    label,
    value,
    unit,
    // 保留当前原型效果：第三张卡片下降 26%，其余卡片上升 12%。
    changeRate: index === 2 ? -26 : 12,
    icon: icons[index] || 'DataLine',
  }))
}
