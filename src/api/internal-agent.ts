import { request } from './request'
import { getLlmToken } from './governance-llm'
import type { AgentInput, AgentOptions, AgentRun, AgentBatch } from '../types/internal-agent'
import type { PageResult } from '../types'
const root = '/internal-agent'
const modelHeaders = () =>
  getLlmToken() ? { 'X-LLM-Authorization': `Bearer ${getLlmToken()}` } : {}
export const agentApi = {
  batches: (q = '', page = 1, signal?: AbortSignal) =>
    request<PageResult<AgentBatch>>({
      url: `${root}/batches`,
      params: { q, page, pageSize: 20 },
      signal,
      silent: true,
    }),
  options: (signal?: AbortSignal) =>
    request<AgentOptions>({
      url: `${root}/options`,
      signal,
      silent: true,
      headers: modelHeaders(),
    }),
  list: (signal?: AbortSignal) =>
    request<{ items: AgentRun[]; limit: number }>({ url: `${root}/runs`, signal, silent: true }),
  detail: (id: string, signal?: AbortSignal) =>
    request<AgentRun>({ url: `${root}/runs/${encodeURIComponent(id)}`, signal, silent: true }),
  create: (input: AgentInput, key: string) =>
    request<AgentRun>({
      url: `${root}/runs`,
      method: 'POST',
      data: input,
      headers: { ...modelHeaders(), 'X-Request-Id': key },
      silent: true,
    }),
  stop: (id: string) =>
    request<AgentRun>({
      url: `${root}/runs/${encodeURIComponent(id)}/stop`,
      method: 'POST',
      silent: true,
    }),
  trace: (id: string) =>
    request<AgentRun>({
      url: `${root}/runs/${encodeURIComponent(id)}/trace`,
      method: 'POST',
      silent: true,
    }),
}
