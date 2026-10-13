import { createRenderer, nextTick, ssrContextKey } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RiskWeightAccuracy } from '../../../types/data-risk'

const api = vi.hoisted(() => ({
  getRiskWeightAccuracyOverview: vi.fn(),
  getRiskResultWeightAccuracy: vi.fn(),
}))
vi.mock('../../../api/data-risk', () => api)
vi.mock('../../../api/request', () => ({ isMock: true }))
vi.mock('../../../api/governance-llm', () => ({ isGovernanceLlm: false }))
import Card from './RiskWeightAccuracyCard.vue'

interface Host {
  text?: string
  props: Record<string, unknown>
}
interface State {
  data?: RiskWeightAccuracy
  loading: boolean
  failed: boolean
  hasAccuracy: boolean
  percentage: number
  load(): Promise<void>
}
const flush = async () => {
  for (let i = 0; i < 10; i++) await nextTick()
}
function mount(variant: 'overview' | 'result', resultId?: string) {
  const nodes: Host[] = []
  const renderer = createRenderer<Host, Host>({
    patchProp(node, key, _previous, value) {
      node.props[key] = value
    },
    insert() {},
    remove() {},
    createElement: () => {
      const node = { props: {} }
      nodes.push(node)
      return node
    },
    createText: (text) => ({ text, props: {} }),
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
  const app = renderer.createApp(Card, { variant, resultId })
  app.provide(ssrContextKey, {})
  app.config.warnHandler = () => {}
  const vm = app.mount({ props: {} })
  return {
    state: (vm.$ as unknown as { setupState: State }).setupState,
    nodes,
    setResultId(id: string) {
      vm.$.props.resultId = id
    },
    unmount: () => app.unmount(),
  }
}
const metric = { accuracyPercent: 92.3, correctCount: 923, totalCount: 1000 }

describe('数据权重判别准确率卡片', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.getRiskWeightAccuracyOverview.mockResolvedValue(metric)
    api.getRiskResultWeightAccuracy.mockResolvedValue(metric)
  })
  it('总体在挂载时独立查询，展示使用同一份统计与百分比', async () => {
    const { state, unmount } = mount('overview')
    await flush()
    expect(api.getRiskWeightAccuracyOverview).toHaveBeenCalledOnce()
    expect(api.getRiskResultWeightAccuracy).not.toHaveBeenCalled()
    expect(state.data).toEqual(metric)
    expect(state.percentage).toBe(92.3)
    expect(state.hasAccuracy).toBe(true)
    unmount()
  })
  it('切换批次清空旧统计，迟到响应不能覆盖当前结果', async () => {
    let resolve!: (value: RiskWeightAccuracy) => void
    api.getRiskResultWeightAccuracy.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r
        }),
    )
    const { state, setResultId, unmount } = mount('result', 'old')
    expect(state.loading).toBe(true)
    setResultId('new')
    expect(state.data).toBeUndefined()
    await flush()
    expect(api.getRiskResultWeightAccuracy).toHaveBeenLastCalledWith('new')
    resolve({ accuracyPercent: 50, correctCount: 1, totalCount: 2 })
    await flush()
    expect(state.data).toEqual(metric)
    expect(api.getRiskWeightAccuracyOverview).not.toHaveBeenCalled()
    unmount()
  })
  it('请求失败可重试；无样本显示暂无统计，真实零准确率正常展示', async () => {
    api.getRiskWeightAccuracyOverview.mockRejectedValueOnce(new Error('接口未配置'))
    const { state, unmount } = mount('overview')
    await flush()
    expect(state.failed).toBe(true)
    expect(state.loading).toBe(false)
    api.getRiskWeightAccuracyOverview.mockResolvedValueOnce({
      accuracyPercent: null,
      correctCount: 0,
      totalCount: 0,
    })
    await state.load()
    expect(state.failed).toBe(false)
    expect(state.hasAccuracy).toBeFalsy()
    api.getRiskWeightAccuracyOverview.mockResolvedValueOnce({
      accuracyPercent: 0,
      correctCount: 0,
      totalCount: 10,
    })
    await state.load()
    expect(state.hasAccuracy).toBe(true)
    unmount()
  })
  it('卸载后忽略尚未完成的响应', async () => {
    let resolve!: (value: RiskWeightAccuracy) => void
    api.getRiskWeightAccuracyOverview.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r
        }),
    )
    const { state, unmount } = mount('overview')
    unmount()
    resolve(metric)
    await flush()
    expect(state.data).toBeUndefined()
  })
})
