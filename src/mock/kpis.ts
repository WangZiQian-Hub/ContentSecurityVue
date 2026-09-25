import type { Kpi } from '../types'

type KpiKind =
  | 'dashboard'
  | 'governance'
  | 'governance-process'
  | 'model'
  | 'compliance'
  | 'evaluation'
  | 'resource-overview'
  | 'resource-ingest'
  | 'resource-datasets'
  | 'resource-statistics'
  | 'system'

const icons = ['Coin', 'Document', 'WarningFilled', 'Box', 'CircleCheckFilled', 'PieChart']

// 名称、数值、单位；可选变化率、图标和稳定 ID。
// 旧页面保留原来的三项写法，新页面可提供完整展示信息。
type KpiRow = [string, number, string, number?, string?, string?]
const rawKpis: Record<KpiKind, KpiRow[]> = {
  'governance-process': [
    ['处理任务总数', 128, '个', 12, 'Coin', 'process-total'],
    ['正在运行', 3, '个', -25, 'VideoPlay', 'process-running'],
    ['今日处理量', 268400, '条次', 18, 'Document', 'process-today'],
    ['任务成功率', 98.4, '%', 0.6, 'Shield', 'process-success'],
  ],
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
  'resource-overview': [
    ['数据集总数', 128, '个', 12, 'Coin', 'datasets'],
    ['数据总量', 12.56, 'TB', 8, 'Document', 'storage'],
    ['接入数据源', 36, '个', 20, 'Share', 'sources'],
    ['今日新增', 8.6, 'GB', 35, 'Calendar', 'today'],
    ['数据可用率', 98.2, '%', 0.6, 'CircleCheckFilled', 'availability'],
    ['异常数据', 23, '条', -42, 'WarningFilled', 'anomalies'],
  ],
  'resource-ingest': [
    ['接入任务', 326, '个', 12, 'List', 'tasks'],
    ['运行中', 8, '个', 33, 'VideoPlay', 'running'],
    ['今日接入', 8.6, 'GB', 35, 'Coin', 'today'],
    ['成功率', 98.7, '%', 1.2, 'CircleCheckFilled', 'success'],
  ],
  'resource-datasets': [
    ['数据集总数', 128, '个', 12, 'Coin', 'datasets'],
    ['可用数据集', 116, '个', 8, 'Document', 'ready'],
    ['处理中', 8, '个', 33, 'Loading', 'processing'],
    ['异常数据集', 4, '个', -50, 'WarningFilled', 'poor'],
  ],
  'resource-statistics': [
    ['数据集总数', 128, '个', 12, 'Coin', 'datasets'],
    ['数据总量', 12.56, 'TB', 8, 'Document', 'storage'],
    ['本月新增', 1.28, 'TB', 35, 'CirclePlusFilled', 'month'],
    ['数据记录', 3.68, '亿条', 20, 'Document', 'records'],
    ['数据可用率', 98.2, '%', 0.6, 'CircleCheckFilled', 'availability'],
    ['接入成功率', 98.7, '%', 1.2, 'Connection', 'success'],
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

  return rawKpis[safeKind].map(([label, value, unit, changeRate, icon, id], index) => ({
    id: id ?? `${safeKind}-${index + 1}`,
    label,
    value,
    unit,
    // 保留当前原型效果：第三张卡片下降 26%，其余卡片上升 12%。
    changeRate: changeRate ?? (index === 2 ? -26 : 12),
    icon: icon ?? icons[index] ?? 'DataLine',
  }))
}
