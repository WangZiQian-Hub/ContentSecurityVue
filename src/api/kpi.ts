import { getMockKpis } from '../mock/kpis'
import type { Kpi } from '../types'
import { isMock, request } from './request'

/**
 * 获取某个页面的 KPI 卡片。
 *
 * 原型阶段由 mock 数据返回；接入后端时设置 VITE_USE_MOCK=false，
 * 将自动请求 GET /api/v1/kpis?kind=dashboard（kind 会按页面变化）。
 */
export async function getKpis(kind = 'dashboard'): Promise<Kpi[]> {
  if (isMock) return getMockKpis(kind)

  return request<Kpi[]>({
    url: '/kpis',
    method: 'GET',
    params: { kind },
  })
}
