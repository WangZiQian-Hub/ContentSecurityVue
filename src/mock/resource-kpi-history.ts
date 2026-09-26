import { resourceDatasets } from './resource-catalog'
import { ingestTasks } from './resource-ingest'
import type { ResourceDailyComparison, ResourceKpiDataset } from '../types/data-resource'

// 上一天 18:00 保存的数据集状态：当时第五个集仍在处理，第四、第五个集质量待改善。
// 元数据不变；存储量从截至该时刻的完整事件历史汇总。
const previousAt = '2026-09-25T18:00:00+08:00'
const datasetStates: Pick<ResourceKpiDataset, 'id' | 'rowCount' | 'status' | 'qualityStatus'>[] = [
  { id: 1, rowCount: 100, status: 'ready', qualityStatus: 'excellent' },
  { id: 2, rowCount: 110, status: 'ready', qualityStatus: 'excellent' },
  { id: 3, rowCount: 90, status: 'processing', qualityStatus: 'good' },
  { id: 4, rowCount: 100, status: 'ready', qualityStatus: 'poor' },
  { id: 5, rowCount: 90, status: 'processing', qualityStatus: 'poor' },
  { id: 6, rowCount: 100, status: 'ready', qualityStatus: 'good' },
]
const taskStates = [
  { taskId: 'demo_ingest_1', status: 'succeeded' },
  { taskId: 'demo_ingest_2', status: 'running' },
  { taskId: 'demo_ingest_3', status: 'running' },
  { taskId: 'demo_ingest_4', status: 'running' },
] as const

export const resourceDailyComparison: ResourceDailyComparison = {
  currentAt: '2026-09-26T18:00:00+08:00',
  previousAt,
  datasets: datasetStates.map((state) => {
    const dataset = resourceDatasets.find((row) => row.id === state.id)!
    return {
      ...state,
      sourceType: dataset.sourceType,
      sourceName: dataset.sourceName,
      languages: [...dataset.languages],
      createdAt: dataset.createdAt,
      storageGb:
        Math.round(
          (dataset.statistics?.storageEvents || [])
            .filter((event) => Date.parse(event.at) <= Date.parse(previousAt))
            .reduce((sum, event) => sum + event.deltaGb, 0) * 10,
        ) / 10,
    }
  }),
  tasks: taskStates.map((state) => {
    const task = ingestTasks.find((row) => row.taskId === state.taskId)!
    return { ...state, datasetId: task.datasetId, createdAt: task.createdAt }
  }),
}
