import { computed, ref, shallowRef } from 'vue'
import { request } from '../api/request'
import { agentTraceHttp, downloadTraceTicket } from '../api/agent-traces'
import type { Artifact, Ticket, TraceTask } from '../types/agent-traces'

export interface ExecutionExportInput {
  batchId: string
  snapshotId: string
  exportKind: string
  format: string
  [key: string]: unknown
}
interface ExportTransport {
  execute(input: ExecutionExportInput, key: string, signal: AbortSignal): Promise<TraceTask>
  task(id: string, signal: AbortSignal): Promise<TraceTask>
  ticket(id: string, key: string): Promise<Ticket>
  download(ticket: Ticket): Promise<void>
  saveBlob(blob: Blob, filename: string): void
}
const transport: ExportTransport = {
  execute: (input, key, signal) =>
    request({
      url: '/tasks/execute',
      method: 'POST',
      data: { capabilityCode: 'agent_trace_export', name: '思维路径导出', input },
      headers: { 'X-Request-Id': key },
      signal,
      timeout: 30000,
      silent: true,
    }),
  task: (id, signal) => agentTraceHttp.task(id, signal),
  ticket: (id, key) => agentTraceHttp.ticket(id, key),
  download: (ticket) => downloadTraceTicket(ticket),
  saveBlob: (blob, filename) => {
    const url = URL.createObjectURL(blob),
      a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },
}

// Local to execution: other views keep their existing export behavior.
export function useExecutionExport(api: ExportTransport = transport) {
  const task = shallowRef<TraceTask | null>(null),
    busy = ref(false),
    error = ref(''),
    batchId = ref(''),
    downloading = ref(false)
  let generation = 0,
    controller: AbortController | undefined,
    blob: Blob | null = null
  const progress = computed(() => {
    const n = task.value?.progress
    return n == null || !Number.isFinite(n) ? null : Math.max(0, Math.min(100, n))
  })
  const artifacts = computed(() =>
    task.value?.status === 'succeeded' ? task.value.result?.artifacts || [] : [],
  )
  function reset() {
    generation++
    controller?.abort()
    blob = null
    task.value = null
    busy.value = false
    error.value = ''
    batchId.value = ''
    downloading.value = false
  }
  function sleep(ms: number, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      const abort = () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      }
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abort)
        resolve()
      }, ms)
      signal.addEventListener('abort', abort, { once: true })
    })
  }
  async function poll(version: number, signal: AbortSignal) {
    for (
      let i = 0;
      i < 90 && task.value && ['pending', 'running'].includes(task.value.status);
      i++
    ) {
      await sleep(2000, signal)
      const result = await api.task(task.value.taskId, signal)
      if (version !== generation) return
      task.value = result
    }
    if (task.value?.status !== 'succeeded') {
      throw Error(
        task.value?.errorMessage ||
          (task.value?.status === 'cancelled'
            ? '导出任务已取消'
            : task.value?.status === 'failed'
              ? '导出任务失败'
              : '任务尚未完成，可稍后恢复进度查询'),
      )
    }
    if (!task.value.result?.artifacts?.length) throw Error('导出任务未返回可下载文件')
  }
  async function start(
    input: ExecutionExportInput,
    demo: boolean,
    render: () => Promise<Blob> | Blob,
  ) {
    if (busy.value || downloading.value) return
    reset()
    controller = new AbortController()
    const version = generation,
      signal = controller.signal,
      captured = structuredClone(input)
    busy.value = true
    batchId.value = captured.batchId
    task.value = { taskId: '', status: 'pending' }
    try {
      if (demo) {
        const id = `mock_execution_export_${crypto.randomUUID()}`
        task.value = { taskId: id, status: 'pending', progress: 0 }
        await sleep(150, signal)
        task.value = { taskId: id, status: 'running', progress: 30 }
        const result = await render()
        if (version !== generation) return
        task.value = { taskId: id, status: 'running', progress: 85 }
        await sleep(150, signal)
        blob = result
        task.value = {
          taskId: id,
          status: 'succeeded',
          progress: 100,
          result: {
            kind: 'agent_trace_export',
            batchId: captured.batchId,
            snapshotId: captured.snapshotId,
            artifacts: [
              {
                artifactId: id,
                filename: captured.exportKind === 'view' ? 'agent-trace-view.png' : `execution.${captured.format}`,
                mimeType: result.type,
                batchId: captured.batchId,
                snapshotId: captured.snapshotId,
              },
            ],
          },
        }
      } else {
        const result = await api.execute(captured, crypto.randomUUID(), signal)
        if (version !== generation) return
        task.value = result
        await poll(version, signal)
      }
    } catch (e) {
      if (version !== generation || signal.aborted) return
      error.value = e instanceof Error ? e.message : String(e)
      // Keep a known running server task resumable; do not falsely mark it failed.
      if (demo || !task.value?.taskId)
        task.value = { taskId: task.value?.taskId || '', status: 'failed' }
    } finally {
      if (version === generation) busy.value = false
    }
  }
  async function resume() {
    if (busy.value || !task.value?.taskId || !['pending', 'running'].includes(task.value.status))
      return
    controller?.abort()
    controller = new AbortController()
    const version = ++generation,
      signal = controller.signal
    busy.value = true
    error.value = ''
    try {
      await poll(version, signal)
    } catch (e) {
      if (version === generation && !signal.aborted)
        error.value = e instanceof Error ? e.message : String(e)
    } finally {
      if (version === generation) busy.value = false
    }
  }
  async function download(artifact: Artifact) {
    if (downloading.value || !artifacts.value.some((a) => a.artifactId === artifact.artifactId))
      return
    const version = generation
    downloading.value = true
    error.value = ''
    try {
      if (blob) api.saveBlob(blob, artifact.filename)
      else {
        const ticket = await api.ticket(artifact.artifactId, crypto.randomUUID())
        if (version === generation) await api.download(ticket)
      }
    } catch (e) {
      if (version === generation) error.value = e instanceof Error ? e.message : String(e)
    } finally {
      if (version === generation) downloading.value = false
    }
  }
  return {
    task,
    busy,
    error,
    batchId,
    downloading,
    progress,
    artifacts,
    start,
    resume,
    download,
    reset,
  }
}
