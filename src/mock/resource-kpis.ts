import type { Kpi } from '../types'
import type {
  ResourceKpiDataset,
  ResourceKpiTask,
  ResourceView,
  StatisticsQuery,
} from '../types/data-resource'

export function filterResourceDatasets<T extends ResourceKpiDataset>(
  datasets: T[],
  filters: StatisticsQuery,
): T[] {
  return datasets.filter(
    (dataset) =>
      (!filters.datasetId || dataset.id === filters.datasetId) &&
      (!filters.sourceType || dataset.sourceType === filters.sourceType) &&
      (!filters.language || dataset.languages.includes(filters.language)) &&
      (!filters.startDate || dataset.createdAt.slice(0, 10) >= filters.startDate) &&
      (!filters.endDate || dataset.createdAt.slice(0, 10) <= filters.endDate),
  )
}

/** 使用未舍入的原始比值，日差计算之后再舍入，避免 83.3 - 66.7 的精度误差。 */
export function resourceKpis(
  view: ResourceView,
  datasets: ResourceKpiDataset[],
  tasks: ResourceKpiTask[],
): Kpi[] {
  const ids = new Set(datasets.map((dataset) => dataset.id))
  const relatedTasks = tasks.filter(
    (task) => task.datasetId !== undefined && ids.has(task.datasetId),
  )
  const ready = datasets.filter((dataset) => dataset.status === 'ready').length
  const completed = relatedTasks.filter((task) => task.status === 'succeeded').length
  const terminal = relatedTasks.filter(
    (task) => task.status === 'succeeded' || task.status === 'failed',
  ).length
  const kpi = (
    id: string,
    label: string,
    value: number | null,
    unit: string,
    icon: string,
  ): Kpi => ({
    id,
    label,
    value: value ?? 0,
    unit,
    icon,
    changeRate: 0,
    ...(value === null ? { displayValue: '—' } : {}),
  })
  const success = kpi(
    'success',
    view === 'ingest' ? '已结束任务成功率' : '已结束接入成功率',
    terminal ? (completed / terminal) * 100 : null,
    '%',
    view === 'ingest' ? 'CircleCheckFilled' : 'Connection',
  )
  if (view === 'datasets')
    return [
      kpi('datasets', '数据集总数', datasets.length, '个', 'Coin'),
      kpi('ready', '可用数据集', ready, '个', 'Document'),
      kpi(
        'processing',
        '处理中',
        datasets.filter((dataset) => ['processing', 'uploading'].includes(dataset.status)).length,
        '个',
        'Loading',
      ),
      kpi(
        'poor',
        '低质量数据集',
        datasets.filter((dataset) => dataset.qualityStatus === 'poor').length,
        '个',
        'WarningFilled',
      ),
    ]
  if (view === 'ingest')
    return [
      kpi('tasks', '接入任务', relatedTasks.length, '个', 'List'),
      kpi(
        'running',
        '运行中',
        relatedTasks.filter((task) => task.status === 'running').length,
        '个',
        'VideoPlay',
      ),
      kpi('completed', '成功任务', completed, '个', 'CircleCheckFilled'),
      success,
    ]
  return [
    kpi('datasets', '数据集总数', datasets.length, '个', 'Coin'),
    kpi(
      'storage',
      '数据总量',
      datasets.reduce((sum, dataset) => sum + dataset.storageGb, 0),
      'GB',
      'Document',
    ),
    kpi(
      'sources',
      '数据来源',
      new Set(datasets.map((dataset) => dataset.sourceName)).size,
      '类',
      'Share',
    ),
    kpi(
      'records',
      '数据记录',
      datasets.reduce((sum, dataset) => sum + dataset.rowCount, 0),
      '条',
      'Document',
    ),
    kpi(
      'availability',
      '可用数据集占比',
      datasets.length ? (ready / datasets.length) * 100 : null,
      '%',
      'CircleCheckFilled',
    ),
    success,
  ]
}
