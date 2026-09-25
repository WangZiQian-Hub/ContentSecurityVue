import { isMock, request } from './request'
import { getResourceSummary, ingestTasks, resourceDatasets } from '../mock/data-resource'
import type { PageResult, ExecuteTaskReq, Task } from '../types'
import type {
  DatasetQuery,
  IngestTask,
  ResourceDataset,
  ResourceSummary,
  ResourceView,
  StatisticsQuery,
} from '../types/data-resource'
export async function getSummary(
  view: ResourceView,
  filters: StatisticsQuery = {},
): Promise<ResourceSummary> {
  if (isMock) return getResourceSummary(view)
  return request({ url: '/data-resources/summary', params: { view, ...filters } })
}
export async function listDatasets(query: DatasetQuery): Promise<PageResult<ResourceDataset>> {
  if (!isMock) return request({ url: '/datasets', params: query })
  const rows = resourceDatasets.filter(
    (row) =>
      (!query.keyword || row.name.includes(query.keyword)) &&
      (!query.modality || row.modalities.includes(query.modality)) &&
      (!query.language || row.languages.includes(query.language)) &&
      (!query.sourceType || row.sourceType === query.sourceType) &&
      (!query.qualityStatus || row.qualityStatus === query.qualityStatus),
  )
  return {
    items: rows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
    total: rows.length,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(rows.length / query.pageSize),
  }
}
export async function listIngestTasks(query: {
  page: number
  pageSize: number
  keyword?: string
  status?: string
}): Promise<PageResult<IngestTask>> {
  if (!isMock)
    return request({ url: '/tasks', params: { ...query, capabilityCode: 'data_ingest' } })
  const rows = ingestTasks.filter(
    (row) =>
      (!query.keyword || `${row.name}${row.sourceName}`.includes(query.keyword)) &&
      (!query.status || row.status === query.status),
  )
  return {
    items: rows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
    total: rows.length,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(rows.length / query.pageSize),
  }
}
// 写入始终走真实接口；不生成模拟成功或伪造任务留痕。
export function saveDataset(data: Partial<ResourceDataset>) {
  return request<ResourceDataset>({
    url: data.id ? `/datasets/${data.id}` : '/datasets',
    method: data.id ? 'PATCH' : 'POST',
    data,
  })
}
export function uploadResourceFile(file: File) {
  const data = new FormData()
  data.append('file', file)
  return request<{ fileId: string }>({ url: '/files', method: 'POST', data })
}
export function startIngest(data: ExecuteTaskReq) {
  return request<Task>({ url: '/tasks/execute', method: 'POST', data, timeout: 300000 })
}
