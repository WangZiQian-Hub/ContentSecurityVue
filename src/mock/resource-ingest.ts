import { resourceDatasets } from './resource-catalog'
import type { IngestTask } from '../types/data-resource'
/** 保存的演示任务记录，目标ID/版本/名称均绑定资源目录；不作为增长或使用日志。 */
export const ingestTasks: IngestTask[] = [2, 5, 4, 1, 6].map((id, index) => {
  const dataset = resourceDatasets.find((d) => d.id === id)!
  const status = (['succeeded', 'running', 'running', 'succeeded', 'failed'] as const)[index]!
  const progress = [100, 72, 45, 100, 18][index]!
  return {
    taskId: `demo_ingest_${index + 1}`,
    name: `${dataset.name}接入`,
    datasetId: dataset.id,
    datasetVersionId: dataset.versionId,
    datasetName: dataset.name,
    sourceName: dataset.sourceName,
    storageGb: dataset.storageGb,
    progress,
    status,
    createdAt: `2026-09-${[24, 25, 25, 25, 26][index]}T10:00:00+08:00`,
    successCount:
      status === 'succeeded' ? dataset.rowCount : Math.floor((dataset.rowCount * progress) / 100),
    duplicateCount: 0,
    anomalyCount: 0,
    traceId: `demo_trace_${index + 1}`,
  }
})
