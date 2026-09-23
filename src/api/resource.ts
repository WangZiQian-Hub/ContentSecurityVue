import { isMock, request } from './request'
import { getMockResources } from '../mock/data'
import type { PageResult, ResourceRow } from '../types'
export async function listResources(resource: string): Promise<PageResult<ResourceRow>> {
  if (isMock) {
    const items = getMockResources(resource)
    return { items, total: items.length, page: 1, pageSize: 20, totalPages: 1 }
  }
  return request({ url: `/${resource}`, params: { page: 1, pageSize: 20 } })
}
