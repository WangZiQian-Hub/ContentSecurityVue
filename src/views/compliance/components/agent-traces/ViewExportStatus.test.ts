import { createRenderer, defineComponent, h, nextTick, ref, ssrContextKey } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ViewExportStatus from './ViewExportStatus.vue'
import type { TraceTask } from '../../../../types/agent-traces'

afterEach(() => vi.unstubAllGlobals())
describe('automatic export download', () => {
  it.each(['current.json', 'results.zip'])('downloads %s once when generation succeeds', async (filename) => {
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const renderer = createRenderer<Record<string, unknown>, Record<string, unknown>>({
      createElement: (tag) => ({ tag }), createText: (text) => ({ text }),
      createComment: (text) => ({ text }), insert: () => {}, remove: () => {},
      setText: () => {}, setElementText: () => {}, parentNode: () => null,
      nextSibling: () => null, patchProp: () => {},
    })
    const task = ref<TraceTask>({ taskId: filename, status: 'running', progress: 10 })
    const download = vi.fn().mockResolvedValue(undefined)
    const Status = { ...ViewExportStatus, render: () => null } as unknown as typeof ViewExportStatus
    const app = renderer.createApp(defineComponent({
      setup: () => () => h(Status, { task: task.value, download }),
    }))
    app.provide(ssrContextKey, { modules: new Set() })
    app.component('el-progress', { render: () => null })
    app.mount({})
    await nextTick()
    expect(download).not.toHaveBeenCalled()
    const artifact = { artifactId: 'artifact', filename, mimeType: 'application/json', batchId: 'batch', snapshotId: 'snapshot' }
    task.value = { taskId: filename, status: 'succeeded', progress: 100, result: {
      kind: 'agent_trace_export', batchId: 'batch', snapshotId: 'snapshot', artifacts: [artifact],
    } }
    await nextTick()
    await nextTick()
    expect(download).toHaveBeenCalledExactlyOnceWith(artifact)
    task.value = { ...task.value }
    await nextTick()
    expect(download).toHaveBeenCalledTimes(1)
    app.unmount()
  })
})
