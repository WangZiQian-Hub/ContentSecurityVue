import { request } from './request'
import type { AgentTraceApi } from '../types/agent-traces'
const root = '/compliance/agent-traces'
const id = encodeURIComponent
const headers = (key: string) => ({ 'X-Request-Id': key })
export const agentTraceHttp: AgentTraceApi = {
  workspace: (params, signal) =>
    request({ url: `${root}/workspace`, params, signal, silent: true }),
  createBatch: (name, key) =>
    request({
      url: `${root}/batches`,
      method: 'POST',
      data: { name },
      headers: headers(key),
      silent: true,
    }),
  upload: (file, key) => {
    const data = new FormData()
    data.append('file', file)
    return request({ url: '/files', method: 'POST', data, headers: headers(key), silent: true })
  },
  bind: (batchId, expectedVersion, files, key) =>
    request({
      url: `${root}/batches/${id(batchId)}/files`,
      method: 'POST',
      data: { expectedVersion, files },
      headers: headers(key),
      silent: true,
    }),
  samples: (batchId, params, signal) =>
    request({ url: `${root}/batches/${id(batchId)}/samples`, params, signal, silent: true }),
  detail: (batchId, traceId, params, signal) =>
    request({
      url: `${root}/batches/${id(batchId)}/samples/${id(traceId)}`,
      params,
      signal,
      silent: true,
    }),
  execute: (data, key) =>
    request({
      url: '/tasks/execute',
      method: 'POST',
      data,
      headers: headers(key),
      timeout: 300000,
      silent: true,
    }),
  task: (taskId, signal) => request({ url: `/tasks/${id(taskId)}`, signal, silent: true }),
  ticket: (artifactId, key) =>
    request({
      url: `${root}/artifacts/${id(artifactId)}/download-tickets`,
      method: 'POST',
      data: {},
      headers: headers(key),
      silent: true,
    }),
}
export async function downloadTraceTicket(
  ticket: { downloadUrl: string; filename: string },
  demo = false,
) {
  const url = new URL(ticket.downloadUrl, window.location.origin)
  if (!(demo && url.protocol === 'blob:') && url.origin !== window.location.origin)
    throw new Error('下载地址不是受信同源文件服务')
  const response = await fetch(url, { credentials: 'same-origin' })
  if (!response.ok) throw new Error('下载失败，票据可能已过期，请重新下载')
  const objectUrl = URL.createObjectURL(await response.blob())
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = ticket.filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
