import { request } from './request'
import type {
  ExecutionQuery,
  ExecutionWorkspace,
  ExecutionSample,
  ExecutionDetail,
} from '../types/agent-trace-execution'
import type { PageResult } from '../types'
const root = '/compliance/agent-traces'
export const executionHttp = {
  workspace: (params: ExecutionQuery, signal?: AbortSignal) =>
    request<ExecutionWorkspace>({
      url: `${root}/workspace`,
      params: { ...params, view: 'execution' },
      signal,
      silent: true,
    }),
  samples: (batchId: string, params: ExecutionQuery, signal?: AbortSignal) =>
    request<PageResult<ExecutionSample>>({
      url: `${root}/batches/${encodeURIComponent(batchId)}/samples`,
      params: { ...params, view: 'execution' },
      signal,
      silent: true,
    }),
  detail: (batchId: string, traceId: string, params: ExecutionQuery, signal?: AbortSignal) =>
    request<ExecutionDetail>({
      url: `${root}/batches/${encodeURIComponent(batchId)}/samples/${encodeURIComponent(traceId)}`,
      params: { ...params, view: 'execution' },
      signal,
      silent: true,
    }),
}
