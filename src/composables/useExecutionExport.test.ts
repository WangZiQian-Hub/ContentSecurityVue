import { afterEach, describe, expect, it, vi } from 'vitest'
import { useExecutionExport } from './useExecutionExport'
import type { TraceTask } from '../types/agent-traces'

const input = {
  batchId: 'mock_batch_1',
  snapshotId: 'snapshot_1',
  exportKind: 'view',
  format: 'png',
}
const artifact = {
  artifactId: 'artifact_1',
  filename: 'execution.png',
  mimeType: 'image/png',
  batchId: input.batchId,
  snapshotId: input.snapshotId,
}
function transport() {
  return {
    execute: vi.fn(async (): Promise<TraceTask> => ({
      taskId: 'task_1',
      status: 'pending',
      progress: 0,
    })),
    task: vi.fn(async (): Promise<TraceTask> => ({
      taskId: 'task_1',
      status: 'succeeded',
      progress: 100,
      result: {
        kind: 'agent_trace_export',
        batchId: input.batchId,
        snapshotId: input.snapshotId,
        artifacts: [artifact],
      },
    })),
    ticket: vi.fn(async () => ({
      downloadUrl: '/download/1',
      filename: artifact.filename,
      expiresAt: '2026-11-08T10:00:00+08:00',
    })),
    download: vi.fn(async () => {}),
    saveBlob: vi.fn(),
  }
}
describe('execution export lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers()
  })
  it('shows mock stages then waits for explicit download', async () => {
    vi.useFakeTimers()
    const api = transport(),
      state = useExecutionExport(api),
      file = new Blob(['png'], { type: 'image/png' })
    const job = state.start(input, true, () => file)
    expect(state.task.value?.status).toBe('pending')
    expect(state.progress.value).toBe(0)
    expect(state.artifacts.value).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(150)
    expect(state.task.value?.status).toBe('running')
    expect(state.progress.value).toBe(85)
    await vi.advanceTimersByTimeAsync(150)
    await job
    expect(state.progress.value).toBe(100)
    expect(state.task.value?.status).toBe('succeeded')
    expect(api.saveBlob).not.toHaveBeenCalled()
    expect(api.execute).not.toHaveBeenCalled()
    await state.download(state.artifacts.value[0]!)
    expect(api.saveBlob).toHaveBeenCalledWith(file, 'agent-trace-view.png')
  })
  it('uses backend task progress and obtains a ticket only after download is clicked', async () => {
    vi.useFakeTimers()
    const api = transport(),
      state = useExecutionExport(api)
    api.task.mockResolvedValueOnce({ taskId: 'task_1', status: 'running', progress: 46 })
    const job = state.start(input, false, () => new Blob())
    await vi.advanceTimersByTimeAsync(2000)
    expect(state.progress.value).toBe(46)
    expect(api.ticket).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    await job
    expect(state.task.value?.status).toBe('succeeded')
    expect(api.download).not.toHaveBeenCalled()
    await state.download(artifact)
    expect(api.ticket).toHaveBeenCalledWith('artifact_1', expect.any(String))
    expect(api.download).toHaveBeenCalledTimes(1)
  })
  it('prevents duplicates and discards a mock result after leaving the page', async () => {
    vi.useFakeTimers()
    const api = transport(),
      state = useExecutionExport(api),
      render = vi.fn(() => new Blob())
    const job = state.start(input, true, render)
    await state.start(input, true, render)
    state.reset()
    await vi.runAllTimersAsync()
    await job
    expect(render).not.toHaveBeenCalled()
    expect(state.task.value).toBeNull()
    expect(state.busy.value).toBe(false)
    expect(api.saveBlob).not.toHaveBeenCalled()
  })
  it('does not expose a download when rendering fails', async () => {
    vi.useFakeTimers()
    const state = useExecutionExport(transport())
    const job = state.start(input, true, () => {
      throw Error('图片生成失败')
    })
    await vi.runAllTimersAsync()
    await job
    expect(state.error.value).toBe('图片生成失败')
    expect(state.task.value?.status).toBe('failed')
    expect(state.artifacts.value).toHaveLength(0)
  })
})
