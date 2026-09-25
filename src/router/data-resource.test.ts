import { describe, expect, it, vi } from 'vitest'
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return { ...actual, createWebHistory: actual.createMemoryHistory }
})
import router from './index'
describe('数据资源主子页面路由', () => {
  it('总览与三个子页面分别匹配父容器和独立子页面', () => {
    for (const [path, name] of [
      ['', 'overview'],
      ['/ingest', 'ingest'],
      ['/datasets', 'datasets'],
      ['/statistics', 'statistics'],
    ]) {
      const route = router.resolve(`/data-resource${path}`)
      expect(route.name).toBe(`resource-${name}`)
      expect(route.matched).toHaveLength(2)
      expect(route.matched[0]?.path).toBe('/data-resource')
    }
  })
  it('总览不再重定向为接入，非法子路径返回总览', () => {
    expect(router.resolve('/data-resource').matched.at(-1)?.redirect).toBeUndefined()
    expect(router.resolve('/data-resource/missing').matched.at(-1)?.redirect).toBe('/data-resource')
  })
})
