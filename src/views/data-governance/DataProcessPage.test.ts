import { createRenderer, nextTick, ssrContextKey } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProcessInput, ProcessOptions } from '../../types/data-governance'

const mocks = vi.hoisted(() => ({
  store: {
    options: undefined as ProcessOptions | undefined,
    currentTask: undefined as { taskId: string; status: string } | undefined,
    initialize: vi.fn(),
    preview: vi.fn(),
    createTask: vi.fn(),
    loadTasks: vi.fn(),
    refreshCurrentTask: vi.fn(),
  },
  warning: vi.fn(),
  confirm: vi.fn(),
  success: vi.fn(),
}))
vi.mock('../../stores/data-governance', () => ({ useDataGovernanceStore: () => mocks.store }))
vi.mock('../../api/request', () => ({ isMock: true }))
vi.mock('element-plus', () => ({
  ElMessage: { warning: mocks.warning, success: mocks.success },
  ElMessageBox: { confirm: mocks.confirm },
}))
vi.mock('../../components/PanelCard.vue', () => ({ default: { render: () => null } }))
import Page from './DataProcessPage.vue'

interface Host {
  text?: string
}
const renderer = createRenderer<Host, Host>({
  patchProp() {},
  insert() {},
  remove() {},
  createElement: () => ({}),
  createText: (text) => ({ text }),
  createComment: () => ({}),
  setText(node, text) {
    node.text = text
  },
  setElementText(node, text) {
    node.text = text
  },
  parentNode: () => null,
  nextSibling: () => null,
})
interface State {
  form: ProcessInput
  actionError: string
  runAction(action: 'preview' | 'create'): Promise<void>
}
async function mount() {
  const app = renderer.createApp(Page)
  app.provide(ssrContextKey, {})
  app.config.warnHandler = () => {}
  const vm = app.mount({})
  for (let i = 0; i < 5; i++) await nextTick()
  return {
    state: (vm.$ as unknown as { setupState: State }).setupState,
    unmount: () => app.unmount(),
  }
}

describe('数据处理输出版本表单链路', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.store.currentTask = undefined
    mocks.store.options = {
      datasets: [
        { id: 3, name: '数据集', versions: [{ versionId: 'dsv_existing', label: 'v1.0.0' }] },
      ],
      rules: [{ code: 'deduplicate', label: '去重', description: '' }],
      templates: [{ id: 'standard', name: '标准', rules: ['deduplicate'] }],
    }
    mocks.store.preview.mockResolvedValue({ sampleCount: 0, items: [] })
    mocks.confirm.mockResolvedValue(undefined)
  })
  it.each(['', '   ', 'v1.0.0', 'dsv_existing', 'a'.repeat(65)])(
    '创建拒绝空、重名或过长的输出版本：%s',
    async (name) => {
      const { state, unmount } = await mount()
      try {
        state.form.outputVersionName = name
        await state.runAction('create')
        expect(mocks.warning).toHaveBeenCalledOnce()
        expect(mocks.confirm).not.toHaveBeenCalled()
        expect(mocks.store.createTask).not.toHaveBeenCalled()
      } finally {
        unmount()
      }
    },
  )
  it('预览不要求或提交输出版本，创建保留用户命名及处理规则', async () => {
    const { state, unmount } = await mount()
    try {
      await state.runAction('preview')
      expect(mocks.store.preview).toHaveBeenCalledOnce()
      expect(mocks.store.preview.mock.calls[0]![0]).not.toHaveProperty('outputVersionName')
      state.form.outputVersionName = '  清洗版-v1.1.0  '
      await state.runAction('create')
      expect(mocks.confirm.mock.calls[0]![0]).toContain('输出版本：清洗版-v1.1.0')
      expect(mocks.store.createTask).toHaveBeenCalledWith({
        datasetId: 3,
        datasetVersionId: 'dsv_existing',
        scope: 'all',
        templateId: 'standard',
        rules: ['deduplicate'],
        outputVersionName: '清洗版-v1.1.0',
      })
    } finally {
      unmount()
    }
  })
  it('确认弹窗期间表单变化不会改写已确认的任务输入', async () => {
    const { state, unmount } = await mount()
    try {
      let confirm!: () => void
      mocks.confirm.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            confirm = resolve
          }),
      )
      state.form.outputVersionName = 'v1.1.0'
      const creating = state.runAction('create')
      state.form.outputVersionName = 'v2.0.0'
      confirm()
      await creating
      expect(mocks.store.createTask.mock.calls[0]![0].outputVersionName).toBe('v1.1.0')
    } finally {
      unmount()
    }
  })
  it('任务状态后续刷新成功时清除此前的轮询错误提示', async () => {
    vi.useFakeTimers()
    mocks.store.currentTask = { taskId: 'tsk_process_001', status: 'running' }
    mocks.store.refreshCurrentTask.mockResolvedValue(undefined)
    const { state, unmount } = await mount()
    try {
      state.actionError = '任务状态刷新失败，将自动重试。'
      await vi.advanceTimersByTimeAsync(5000)
      expect(mocks.store.refreshCurrentTask).toHaveBeenCalledOnce()
      expect(state.actionError).toBe('')
    } finally {
      unmount()
      vi.useRealTimers()
    }
  })
})
