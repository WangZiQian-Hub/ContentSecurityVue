import { request as platformRequest } from './request'
import { AxiosHeaders, type AxiosRequestConfig } from 'axios'
import { evaluationDemoApi } from '../mock/evaluation'
// 正式后端模式跟随全局 VITE_USE_MOCK 配置；只有显式 demo 才使用内存示例数据。
export const isEvaluationDemo =
  import.meta.env.VITE_EVALUATION_MODE === 'demo' ||
  (import.meta.env.VITE_EVALUATION_MODE !== 'http' && import.meta.env.VITE_USE_MOCK !== 'false')
import type {
  Contexts,
  DownloadTicket,
  EvaluationConfig,
  EvaluationPageResult,
  EvaluationRun,
  EvaluationSession,
  EvaluationTask,
  EventPage,
  Evidence,
  ExportJob,
  ListFilters,
  Manifest,
  Metric,
  MetricInput,
  MetricRevision,
  Preflight,
  RecordResolution,
  RevisionDefinition,
  Sample,
} from '../types/evaluation'
const id = encodeURIComponent
function request<T>(
  config: Omit<AxiosRequestConfig, 'headers'> & { headers?: Record<string, string> },
): Promise<T> {
  const token =
    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('evaluationAccessToken') : null
  if (!token) return platformRequest<T>(config)
  const headers = AxiosHeaders.from(config.headers)
  headers.set('X-Evaluation-Authorization', `Bearer ${token}`)
  return platformRequest<T>({ ...config, headers })
}
const write = <T>(url: string, method: 'POST' | 'PATCH', data: unknown, requestId: string) =>
  request<T>({ url, method, data, headers: { 'X-Request-Id': requestId } })
export const evaluationHttpApi = {
  session: (signal?: AbortSignal) =>
    request<EvaluationSession>({ url: '/evaluation/session', signal }),
  metrics: (params: ListFilters, signal?: AbortSignal) =>
    request<EvaluationPageResult<Metric>>({ url: '/evaluation/metrics', params, signal }),
  revisions: (metricId: string, signal?: AbortSignal) =>
    request<EvaluationPageResult<MetricRevision>>({
      url: `/metrics/${id(metricId)}/revisions`,
      params: { pageSize: 100 },
      signal,
    }),
  revision: (metricId: string, revisionId: string, signal?: AbortSignal) =>
    request<MetricRevision>({
      url: `/metrics/${id(metricId)}/revisions/${id(revisionId)}`,
      signal,
    }),
  createMetric: (data: MetricInput, key: string) => write<Metric>('/metrics', 'POST', data, key),
  revise: (metricId: string, data: RevisionDefinition, key: string) =>
    write<MetricRevision>(`/metrics/${id(metricId)}/revisions`, 'POST', data, key),
  patchRevision: (
    metricId: string,
    revisionId: string,
    definition: RevisionDefinition,
    expectedRevision: number,
    key: string,
  ) =>
    write<MetricRevision>(
      `/metrics/${id(metricId)}/revisions/${id(revisionId)}`,
      'PATCH',
      { definition, expectedRevision },
      key,
    ),
  publish: (metricId: string, revisionId: string, expectedRevision: number, key: string) =>
    write<MetricRevision>(
      `/metrics/${id(metricId)}/revisions/${id(revisionId)}/publish`,
      'POST',
      { expectedRevision },
      key,
    ),
  metricStatus: (metricId: string, status: 'enabled' | 'disabled', key: string) =>
    write<Metric>(`/metrics/${id(metricId)}`, 'PATCH', { status }, key),
  contexts: (kind: string, keyword: string, signal?: AbortSignal) =>
    request<Contexts>({ url: '/evaluation/contexts', params: { kind, keyword }, signal }),
  preflight: (data: EvaluationConfig, key: string) =>
    write<Preflight>('/evaluation/preflights', 'POST', data, key),
  createTask: (name: string, evaluation: EvaluationConfig, key: string) =>
    write<EvaluationTask>(
      '/tasks',
      'POST',
      { name, capabilityCode: 'evaluation', input: {}, config: { evaluation } },
      key,
    ),
  tasks: (params: ListFilters, signal?: AbortSignal) =>
    request<EvaluationPageResult<EvaluationTask>>({ url: '/evaluation/tasks', params, signal }),
  task: (taskId: string, signal?: AbortSignal) =>
    request<EvaluationTask>({ url: `/tasks/${id(taskId)}`, signal }),
  progress: (taskId: string, signal?: AbortSignal) =>
    request<EvaluationTask>({ url: `/evaluation/tasks/${id(taskId)}/progress`, signal }),
  events: (taskId: string, cursor: number, signal?: AbortSignal) =>
    request<EventPage>({
      url: `/evaluation/tasks/${id(taskId)}/events`,
      params: { cursor, limit: 100 },
      signal,
    }),
  start: (taskId: string, key: string) =>
    write<EvaluationTask>(`/tasks/${id(taskId)}/start`, 'POST', { expectedStatus: 'pending' }, key),
  cancel: (taskId: string, key: string) =>
    write<EvaluationTask>(`/tasks/${id(taskId)}/cancel`, 'POST', {}, key),
  retry: (runId: string, reason: string, key: string) =>
    write<EvaluationTask>(`/evaluation/runs/${id(runId)}/retries`, 'POST', { reason }, key),
  runs: (params: ListFilters, signal?: AbortSignal) =>
    request<EvaluationPageResult<EvaluationRun>>({ url: '/evaluation/runs', params, signal }),
  run: (runId: string, signal?: AbortSignal) =>
    request<EvaluationRun>({ url: `/evaluation/runs/${id(runId)}`, signal }),
  records: (params: ListFilters, signal?: AbortSignal) =>
    request<EvaluationPageResult<EvaluationRun>>({ url: '/evaluation/records', params, signal }),
  resolveRecord: (recordId: string, signal?: AbortSignal) =>
    request<RecordResolution>({
      url: '/evaluation/record-resolutions',
      params: { recordId },
      signal,
    }),
  samples: (runId: string, metricCode: string, page: number, signal?: AbortSignal) =>
    request<EvaluationPageResult<Sample>>({
      url: `/evaluation/runs/${id(runId)}/samples`,
      params: { metricCode, page, pageSize: 10, outcome: 'failed' },
      signal,
    }),
  manifest: (runId: string, signal?: AbortSignal) =>
    request<Manifest>({ url: `/evaluation/runs/${id(runId)}/evidence`, signal }),
  evidence: (evidenceId: string, signal?: AbortSignal) =>
    request<Evidence>({ url: `/evaluation/evidence/${id(evidenceId)}`, signal }),
  export: (runId: string, kind: ExportJob['kind'], key: string) =>
    write<ExportJob>(
      `/evaluation/runs/${id(runId)}/exports`,
      'POST',
      { kind, format: kind === 'report' ? 'html' : 'zip', redactionProfile: 'standard' },
      key,
    ),
  exportStatus: (exportId: string, signal?: AbortSignal) =>
    request<ExportJob>({ url: `/evaluation/exports/${id(exportId)}`, signal }),
  ticket: (artifactId: string, key: string) =>
    write<DownloadTicket>(
      `/evaluation/artifacts/${id(artifactId)}/download-tickets`,
      'POST',
      {},
      key,
    ),
}
// Explicit module-local mode. HTTP failures never fall back to example data.
export const evaluationApi: typeof evaluationHttpApi = isEvaluationDemo
  ? evaluationDemoApi
  : evaluationHttpApi
