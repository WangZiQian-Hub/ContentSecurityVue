import { AxiosError } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { agentTraceHttp } from '../api/agent-traces'
import { createAgentTraceMock } from '../mock/agent-traces'
import { useAgentTraceStore } from './agent-traces'
import type { Workspace } from '../types/agent-traces'
afterEach(() => vi.restoreAllMocks())
describe('trace request lifecycle', () => {
  it('ignores a delayed workspace response after a newer selection', async () => {
    setActivePinia(createPinia())
    const mock = createAgentTraceMock(),
      w = await mock.workspace({}),
      d = await mock.detail(w.batch!.batchId, w.resolvedSelection.traceId!, {
        snapshotId: w.batch!.activeSnapshotId!,
      })
    let complete!: (w: Workspace) => void
    const old = new Promise<Workspace>((r) => {
      complete = r
    })
    vi.spyOn(agentTraceHttp, 'workspace').mockReturnValueOnce(old).mockResolvedValue(w)
    vi.spyOn(agentTraceHttp, 'detail').mockResolvedValue(d)
    const store = useAgentTraceStore()
    store.configure(false)
    const first = store.load({})
    await store.load({})
    const stale = structuredClone(w)
    stale.summary.parsedTraceCount = 999
    complete(stale)
    await first
    expect(store.workspace?.summary.parsedTraceCount).toBe(200)
    store.dispose()
  })
  it('clears data and errors when switching execution mode', async () => {
    setActivePinia(createPinia())
    const store = useAgentTraceStore()
    store.configure(true)
    await store.load({})
    store.actionError = 'old error'
    store.configure(false)
    expect(store.workspace).toBeNull()
    expect(store.detail).toBeNull()
    expect(store.actionError).toBe('')
    expect(store.demo).toBe(false)
    store.dispose()
  })
})


it('keeps polling a long audit after a temporary connection failure', async () => {
  vi.useFakeTimers()
  setActivePinia(createPinia())
  const store = useAgentTraceStore()
  try {
    const mock = createAgentTraceMock()
    const workspace = await mock.workspace({})
    const batchId = workspace.batch!.batchId
    const running = { taskId: 'long-audit', status: 'running' as const, progress: 60 }
    const initial = { ...workspace, resolvedSelection: { ...workspace.resolvedSelection, traceId: null },
      activeTasks: [running] }
    const refreshed = { ...initial, activeTasks: [] }
    const load = vi.spyOn(agentTraceHttp, 'workspace').mockResolvedValueOnce(initial).mockResolvedValue(refreshed)
    const status = vi.spyOn(agentTraceHttp, 'task')
      .mockRejectedValueOnce(new AxiosError('connection interrupted'))
      .mockResolvedValue({ ...running, status: 'succeeded', progress: 100,
        result: { kind: 'agent_trace_ingest', batchId, snapshotId: 'new-snapshot' } })
    await store.load({})
    await vi.advanceTimersByTimeAsync(2000)
    expect(store.actionError).toBe('')
    expect(status).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(load).toHaveBeenLastCalledWith({ batchId }, expect.any(AbortSignal))
    expect(store.task?.status).toBe('succeeded')
  } finally {
    store.dispose()
    vi.useRealTimers()
  }
})


it('keeps one upload key for a retry and sends a new key when the same file is selected again', async () => {
  setActivePinia(createPinia())
  const store = useAgentTraceStore()
  try {
    const file = { name: 'same.jsonl', size: 10, lastModified: 1 } as File
    const upload = vi.spyOn(agentTraceHttp, 'upload')
      .mockRejectedValueOnce(new AxiosError('connection interrupted'))
      .mockResolvedValue({ fileId: 'saved-file' })
    await expect(store.upload(file, 'first-selection')).rejects.toThrow('connection interrupted')
    await store.upload(file, 'first-selection')
    await store.upload(file, 'new-selection')
    expect(upload.mock.calls).toEqual([
      [file, 'first-selection'], [file, 'first-selection'], [file, 'new-selection'],
    ])
  } finally {
    store.dispose()
  }
})

it('shows the binding response reason instead of the generic HTTP status', async () => {
  setActivePinia(createPinia())
  const store = useAgentTraceStore()
  try {
    const error = new AxiosError('Request failed with status code 404')
    Object.assign(error, { response: { status: 404, data: { message: '上传文件不存在' } } })
    await store.action(async () => { throw error })
    expect(store.actionError).toBe('上传文件不存在')
  } finally {
    store.dispose()
  }
})


it('can delete, recreate, and bind the same file within one page session', async () => {
  setActivePinia(createPinia())
  const store = useAgentTraceStore()
  store.configure(true)
  try {
    const file = new File(['{"messages":[]}'], 'same.jsonl')
    await store.create('旧批次')
    const oldBatchId = store.workspace?.batch?.batchId
    const first = await store.upload(file, 'old-upload')
    await store.bind([{ fileId: first.fileId, formatOverride: 'auto' }])
    await store.deleteItem(null)
    expect(store.actionError).toBe('')

    await store.create('新批次')
    expect(store.workspace?.batch?.batchId).not.toBe(oldBatchId)
    const second = await store.upload(file, 'new-upload')
    expect(second.fileId).not.toBe(first.fileId)
    await store.bind([{ fileId: second.fileId, formatOverride: 'auto' }])
    expect(store.workspace?.batch?.allowedActions).toContain('parse')
    expect(store.workspace?.files.items).toEqual([
      expect.objectContaining({ fileId: second.fileId, parseStatus: 'pending' }),
    ])
  } finally {
    store.dispose()
  }
})
