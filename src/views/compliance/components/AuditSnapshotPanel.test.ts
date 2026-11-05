import { createRenderer, nextTick, ssrContextKey } from 'vue'
import { beforeEach, expect, it, vi } from 'vitest'
import Panel from './AuditSnapshotPanel.vue'
import { request } from '../../../api/request'
vi.mock('../../../api/request', () => ({ request: vi.fn() }))
interface Host {
  props: Record<string, unknown>
  text?: string
}
interface State {
  save(): Promise<void>
  saved: { entityId: string } | null
  rows: unknown[]
  error: string
}
function mount(demo = false) {
  const renderer = createRenderer<Host, Host>({
    patchProp(node, key, _old, value) {
      node.props[key] = value
    },
    insert() {},
    remove() {},
    createElement: () => ({ props: {} }),
    createText: (text) => ({ props: {}, text }),
    createComment: () => ({ props: {} }),
    setText(node, text) {
      node.text = text
    },
    setElementText(node, text) {
      node.text = text
    },
    parentNode: () => null,
    nextSibling: () => null,
  })
  const app = renderer.createApp(Panel, { kind: 'task', entityType: 'task', entityId: 'old', demo })
  app.provide(ssrContextKey, {})
  app.config.warnHandler = () => {}
  const vm = app.mount({ props: {} })
  return {
    state: (vm.$ as unknown as { setupState: State }).setupState,
    change() {
      vm.$.props.entityId = 'new'
    },
    unmount: () => app.unmount(),
  }
}
beforeEach(() => vi.resetAllMocks())
it('演示模式不会创建真实快照', async () => {
  const p = mount(true)
  await p.state.save()
  expect(request).not.toHaveBeenCalled()
  p.unmount()
})
it('保存服务端固定版本并读取该版本的检查明细', async () => {
  vi.mocked(request)
    .mockResolvedValueOnce({ entityId: 'snapshot', versionId: 'hash', name: '五要素' })
    .mockResolvedValueOnce({
      snapshot: { samples: [{ sampleId: 'input', predictedDisplay: '缺失' }] },
    })
  const p = mount()
  await p.state.save()
  expect(request).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      method: 'POST',
      data: expect.objectContaining({ entityId: 'old', kind: 'task' }),
    }),
  )
  expect(request).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ params: { versionId: 'hash' } }),
  )
  expect(p.state.saved?.entityId).toBe('snapshot')
  expect(p.state.rows).toHaveLength(1)
  p.unmount()
})
it('对象切换后迟到的保存响应不会冒充新对象快照', async () => {
  let resolve!: (value: unknown) => void
  vi.mocked(request).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r
      }),
  )
  const p = mount()
  const pending = p.state.save()
  p.change()
  await nextTick()
  resolve({ entityId: 'old-snapshot', versionId: 'hash' })
  await pending
  expect(p.state.saved).toBeNull()
  expect(request).toHaveBeenCalledTimes(1)
  p.unmount()
})
it('保存失败显示真实错误并清空结果', async () => {
  vi.mocked(request).mockRejectedValueOnce(new Error('任务未完成'))
  const p = mount()
  await p.state.save()
  expect(p.state.error).toBe('任务未完成')
  expect(p.state.saved).toBeNull()
  p.unmount()
})
