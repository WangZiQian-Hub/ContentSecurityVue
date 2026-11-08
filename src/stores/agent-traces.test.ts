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
