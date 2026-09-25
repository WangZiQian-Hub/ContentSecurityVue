import { isMock, request } from './request'
import { latestDemoResult, savedDemoResult, valueOptions } from '../mock/data-value'
import { getResourceSamples } from './data-resource'
import { VALUE_KIND } from '../types/data-value'
import type {
  ValueOptions,
  ValueResult,
  ValueSample,
  ValueSampleQuery,
  ValueScope,
  ValueTask,
} from '../types/data-value'
import type { PageResult } from '../types'

export async function getValueOptions(): Promise<ValueOptions> {
  return isMock
    ? structuredClone(valueOptions)
    : request({ url: '/data-governance/options', params: { kind: VALUE_KIND } })
}
export async function getLatestValueResult(scope: ValueScope): Promise<ValueResult | null> {
  return isMock
    ? latestDemoResult(scope)
    : request({ url: '/data-governance/value-results/latest', params: scope })
}
export async function getValueResult(id: string): Promise<ValueResult> {
  return isMock
    ? savedDemoResult(id).result
    : request({ url: `/data-governance/value-results/${encodeURIComponent(id)}` })
}
export async function listValueSamples(
  id: string,
  query: ValueSampleQuery,
): Promise<PageResult<ValueSample>> {
  if (!isMock) {
    const [result, page] = await Promise.all([
      getValueResult(id),
      request<PageResult<ValueSample>>({
        url: `/data-governance/value-results/${encodeURIComponent(id)}/samples`,
        params: query,
      }),
    ])
    const resources = await getResourceSamples(
      result.scope.datasetId,
      result.scope.versionId,
      page.items.map((row) => row.id),
    )
    page.items = page.items.map((row) => {
      const sample = resources.find((item) => item.id === row.id)
      if (
        !sample ||
        sample.datasetId !== result.scope.datasetId ||
        sample.versionId !== result.scope.versionId ||
        sample.text !== row.text
      )
        throw new Error('评分样本与数据资源版本不一致')
      return { ...row, id: sample.id, text: sample.text }
    })
    return page
  }
  const rows = savedDemoResult(id).samples.filter(
    (item) =>
      (query.tier === 'all' || item.tier === query.tier) &&
      (!query.keyword || `${item.id}${item.text}`.includes(query.keyword)) &&
      (!query.bin ||
        (item.score !== null && String(Math.min(4, Math.floor(item.score / 20))) === query.bin)),
  )
  if (query.sortBy && query.sortOrder) {
    const ranks = { low: 0, medium: 1, high: 2, unavailable: -1 }
    const direction = query.sortOrder === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      const aUnavailable = a.score === null || a.tier === 'unavailable'
      const bUnavailable = b.score === null || b.tier === 'unavailable'
      // 无论升降序，不可评估均置底；同值按资源 ID 稳定排序。
      if (aUnavailable !== bUnavailable) return aUnavailable ? 1 : -1
      const difference = aUnavailable
        ? 0
        : query.sortBy === 'score'
          ? a.score! - b.score!
          : ranks[a.tier] - ranks[b.tier]
      return difference * direction || a.id.localeCompare(b.id, 'en', { numeric: true })
    })
  }
  return {
    items: rows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
    total: rows.length,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(rows.length / query.pageSize),
  }
}
export async function listValueTasks(scope: ValueScope): Promise<PageResult<ValueTask>> {
  if (!isMock)
    return request({ url: '/tasks', params: { kind: VALUE_KIND, ...scope, page: 1, pageSize: 20 } })
  const result = latestDemoResult(scope)
  return {
    items: result
      ? [
          {
            taskId: result.taskId,
            name: '数据价值分析',
            status: 'succeeded',
            createdAt: result.finishedAt,
            resultId: result.id,
          },
        ]
      : [],
    total: result ? 1 : 0,
    page: 1,
    pageSize: 20,
    totalPages: result ? 1 : 0,
  }
}
export function createValueTask(scope: ValueScope): Promise<ValueTask> {
  return request({
    url: '/tasks',
    method: 'POST',
    data: { kind: VALUE_KIND, name: '数据价值分析', input: scope },
  })
}
export function getValueTask(taskId: string): Promise<ValueTask> {
  return request({ url: `/tasks/${encodeURIComponent(taskId)}`, params: { kind: VALUE_KIND } })
}
