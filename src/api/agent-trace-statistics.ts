import { request } from './request'
import type { AgentTraceStatisticsApi } from '../types/agent-trace-statistics'
const root = '/compliance/agent-traces'
const id = encodeURIComponent
export const agentTraceStatisticsHttp: AgentTraceStatisticsApi = {
  statistics: (params, signal) =>
    request({ url: `${root}/statistics`, params, signal, silent: true }),
  samples: (batchId, params, signal) =>
    request({
      url: `${root}/batches/${id(batchId)}/samples`,
      params: { ...params, view: 'statistics' },
      signal,
      silent: true,
    }),
  sample: (batchId, traceId, params, signal) =>
    request({
      url: `${root}/batches/${id(batchId)}/samples/${id(traceId)}`,
      params: { ...params, view: 'statistics' },
      signal,
      silent: true,
    }),
  export: (data, key, signal) =>
    request({
      url: '/tasks/execute',
      method: 'POST',
      data,
      headers: { 'X-Request-Id': key },
      signal,
      silent: true,
    }),
  task: (taskId, signal) => request({ url: `/tasks/${id(taskId)}`, signal, silent: true }),
  ticket: (artifactId, key, signal) =>
    request({
      url: `${root}/artifacts/${id(artifactId)}/download-tickets`,
      method: 'POST',
      data: {},
      headers: { 'X-Request-Id': key },
      signal,
      silent: true,
    }),
}
