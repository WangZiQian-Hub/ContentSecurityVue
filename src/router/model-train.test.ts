import { describe, expect, it, vi } from 'vitest'
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return { ...actual, createWebHistory: actual.createMemoryHistory }
})
import router from './index'

describe('模型训推五个独立子页面', () => {
  it('五个页签分别匹配独立页面，不全部落回训练页', async () => {
    const components = new Set()
    for (const tab of ['training', 'management', 'evaluation', 'deploy', 'invoke']) {
      const resolved = router.resolve(`/model-train/${tab}`)
      expect(resolved.name).toBe(`model-${tab}`)
      expect(resolved.matched).toHaveLength(2)
      expect(resolved.matched[0]!.path).toBe('/model-train')
      components.add(resolved.matched[1]!.components!.default)
    }
    expect(components.size).toBe(5)
  })
  it('主入口默认训练页，非法子页返回主入口', () => {
    expect(router.resolve('/model-train').name).toBe('model-training')
    expect(router.resolve('/model-train/missing').matched.at(-1)?.redirect).toBe('/model-train')
  })
})
