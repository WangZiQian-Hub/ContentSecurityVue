import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it, vi } from 'vitest'
import type { ResourceSummary, ResourceView } from '../../types/data-resource'
// 本测试隔离图标和路由出口，只验证真实资源卡片及插槽的 HTML。
/* eslint-disable vue/one-component-per-file */
const state = vi.hoisted(() => ({
  summary: undefined as ResourceSummary | undefined,
  route: { name: 'resource-overview', path: '/data-resource' },
  loadSummary: vi.fn(),
  loadOptions: vi.fn(),
}))
vi.mock('../../stores/data-resource', () => ({ useDataResourceStore: () => state }))
vi.mock('vue-router', () => ({ useRoute: () => state.route }))
vi.mock('../../api/kpi', () => ({ getKpis: vi.fn() }))
vi.mock('../../components/AppIcon.vue', () => ({ default: { render: () => null } }))
import DataResourcePage from './DataResourcePage.vue'
import KpiStrip from '../../components/KpiStrip.vue'
import { getResourceSummary } from '../../mock/resource-statistics'
import { formatResourceComparison } from '../../utils/resource-comparison'

describe('四个资源页面实际渲染日环比文案', () => {
  it.each(['overview', 'ingest', 'datasets', 'statistics'] as ResourceView[])(
    '%s 页面不再被固定占位文案覆盖',
    async (view) => {
      state.route = {
        name: `resource-${view}`,
        path: view === 'overview' ? '/data-resource' : `/data-resource/${view}`,
      }
      state.summary = getResourceSummary(view)
      const app = createSSRApp(DataResourcePage)
      app.component(
        'RouterLink',
        defineComponent({
          setup:
            (_, { slots }) =>
            () =>
              h('a', slots.default?.()),
        }),
      )
      app.component('RouterView', { render: () => null })
      app.component('ElAlert', { render: () => null })
      app.component('ElButton', { render: () => null })
      app.directive('loading', {})
      const html = await renderToString(app)
      expect(html).not.toContain('暂无可比数据')
      expect(html).toContain('日环比（北京时间）')
      expect(html).toContain('2026/9/25 18:00:00')
      for (const item of state.summary.kpis)
        expect(html).toContain(formatResourceComparison(item.comparison))
      expect(html).toContain('class="increase"')
      expect(html).toContain('class="positive"')
      if (view !== 'ingest') {
        expect(html).toContain('color:#909399;')
        expect(html).toContain('→ 0%')
      }
      expect((html.match(/class="mini-bars"/g) || []).length).toBe(
        view === 'overview' || view === 'statistics' ? 0 : 4,
      )
    },
  )
  it('共用卡片组件未提供资源插槽时保留其他页面原有文案', async () => {
    const item = {
      id: 'other',
      label: '其他模块',
      value: 10,
      unit: '个',
      changeRate: 12,
      icon: 'Coin',
    }
    const original = await renderToString(createSSRApp(KpiStrip, { snapshotItems: [item] }))
    expect(original).toContain('↑ +12%')
    const custom = await renderToString(
      createSSRApp(KpiStrip, { snapshotItems: [item], comparisonLabel: '既有说明' }),
    )
    expect(custom).toContain('既有说明')
    expect(custom).not.toContain('较前日')
  })
})
