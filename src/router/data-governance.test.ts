import { describe, expect, it, vi } from 'vitest'
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return { ...actual, createWebHistory: actual.createMemoryHistory }
})
import router from './index'
import { navigation } from './navigation'
describe('数据治理路由', () => {
  it('主入口和 process 地址均使用同一数据处理子页面', () => {
    for (const path of ['/data-governance', '/data-governance/process']) {
      const route = router.resolve(path)
      expect(route.name).toBe('governance-process')
      expect(route.matched).toHaveLength(2)
    }
  })
  it('其他页签保留配置，但直接地址返回数据处理', () => {
    const tabs = navigation.find((item) => item.path === '/data-governance')!.tabs
    expect(tabs).toHaveLength(5)
    expect(router.resolve('/data-governance/value-analysis').name).toBe('governance-value')
    for (const tab of tabs.filter((item) => !['process', 'value-analysis'].includes(item.path))) {
      expect(router.resolve(`/data-governance/${tab.path}`).matched.at(-1)?.redirect).toBe(
        '/data-governance',
      )
    }
  })
  it('数据资源和模型训推路由继续可用', () => {
    expect(router.resolve('/data-resource/datasets').name).toBe('resource-datasets')
    expect(router.resolve('/model-train/management').matched.at(-1)?.redirect).toBeUndefined()
  })
})
