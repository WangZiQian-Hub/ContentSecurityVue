import { isMock, request } from './request'
import { getGovernanceResources } from './governance-resources'
import { anomalyMock } from '../mock/data-anomaly'
import { getResourceSamples } from './data-resource'
import {
  ANOMALY_KIND,
  type Scope,
  type Query,
  type Result,
  type Sample,
  type Options,
  type Overview,
  type Task,
  type ChangeSet,
  type VersionCheck,
  type Published,
} from '../types/data-anomaly'
import type { PageResult } from '../types'
const base = '/data-governance/anomaly-results'
const kind = ANOMALY_KIND
const get = <T>(url: string, params = {}) => request<T>({ url, params: { kind, ...params } })
const post = <T>(url: string, data = {}) =>
  request<T>({ url, method: 'POST', data: { kind, ...data } })
export async function getAnomalyOptions(): Promise<Options> {
  const [options, datasets] = await Promise.all([
    isMock ? anomalyMock.options() : get<Options>('/data-governance/options'),
    getGovernanceResources(),
  ])
  return { ...options, datasets }
}
export const getAnomalyOverview = async (): Promise<Overview> =>
  isMock ? anomalyMock.overview() : get('/overview')
export const getLatestAnomaly = async (scope: Scope): Promise<Result | null> =>
  isMock ? anomalyMock.latest(scope) : get(`${base}/latest`, scope)
export const getAnomalyHistory = async (scope: Scope): Promise<Result[]> =>
  isMock ? anomalyMock.history(scope) : get(base, scope)
export const getAnomalyResult = async (id: string): Promise<Result> =>
  isMock ? anomalyMock.result(id) : get(`${base}/${encodeURIComponent(id)}`)
async function validateResources(id: string, rows: Sample[]) {
  const result = await getAnomalyResult(id)
  const resources = await getResourceSamples(
    result.scope.datasetId,
    result.scope.versionId,
    rows.map((s) => s.id),
  )
  for (const row of rows) {
    const resource = resources.find(
      (s) =>
        s.id === row.id &&
        s.datasetId === result.scope.datasetId &&
        s.versionId === result.scope.versionId,
    )
    if (!resource || resource.text !== row.text || resource.language !== row.language)
      throw new Error('异常样本与数据资源版本不一致')
  }
  return rows
}
export async function listAnomalySamples(id: string, query: Query): Promise<PageResult<Sample>> {
  const page = isMock
    ? anomalyMock.samples(id, query)
    : await get<PageResult<Sample>>(`${base}/${encodeURIComponent(id)}/samples`, query)
  await validateResources(id, page.items)
  return page
}
export async function getAnomalySample(id: string, sampleId: string): Promise<Sample> {
  const sample = isMock
    ? anomalyMock.detail(id, sampleId)
    : await get<Sample>(`${base}/${encodeURIComponent(id)}/samples/${encodeURIComponent(sampleId)}`)
  await validateResources(id, [sample])
  return sample
}
export const updateCandidate = async (
  id: string,
  sampleId: string,
  action: string,
  candidateId?: string,
  inputSampleRevisionId?: string,
): Promise<Sample> =>
  isMock
    ? anomalyMock.mutate(id, sampleId, action, candidateId, inputSampleRevisionId)
    : post(
        `${base}/${encodeURIComponent(id)}/samples/${encodeURIComponent(sampleId)}/candidates/${action}`,
        { candidateId, inputSampleRevisionId },
      )
export const startAnomaly = async (input: Scope): Promise<Task> =>
  isMock ? anomalyMock.start(input) : post('/tasks', { name: '异常数据检测', input })
export const getAnomalyTask = async (id: string): Promise<Task> =>
  isMock ? anomalyMock.task(id) : get(`/tasks/${encodeURIComponent(id)}`)
export const getAnomalyChangeSet = async (scope: Scope): Promise<ChangeSet> =>
  isMock ? anomalyMock.changeSet(scope) : get('/data-governance/change-sets/current', scope)
export const removeAnomalyEntry = async (scope: Scope, candidateId: string): Promise<ChangeSet> =>
  isMock
    ? anomalyMock.remove(scope, candidateId)
    : post('/data-governance/change-sets/remove', { ...scope, candidateId })
export const checkAnomalyVersion = async (scope: Scope): Promise<VersionCheck> =>
  isMock ? anomalyMock.check(scope) : post('/data-governance/change-sets/validate', scope)
export const publishAnomalyVersion = async (
  scope: Scope,
  validationToken: string,
): Promise<Published> =>
  isMock
    ? anomalyMock.publish(scope, validationToken)
    : post('/data-governance/change-sets/generate-version', { ...scope, validationToken })
export async function exportAnomalySamples(id: string, query: Query) {
  // 服务端分页遍历完整匹配集合，绝不只导出当前页。
  const rows: Sample[] = []
  let page = 1,
    total = 0
  do {
    const result = await listAnomalySamples(id, { ...query, page, pageSize: 100 })
    total = result.total
    if (!result.items.length && rows.length < total) throw new Error('导出期间数据变化，请重试')
    rows.push(...result.items)
    page++
  } while (rows.length < total)
  return rows
}
