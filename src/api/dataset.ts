import { listDatasets as listResourceDatasets } from './data-resource'
import type { PageResult, ResourceRow } from '../types'
/** 旧平台表格也读取统一资源目录，仅适配显示DTO，不另造数据集。 */
export async function listDatasets(): Promise<PageResult<ResourceRow>> {
  const items: ResourceRow[] = []
  let page = 1
  while (true) {
    const result = await listResourceDatasets({ page, pageSize: 100 })
    items.push(
      ...result.items.map((d) => ({
        id: d.id,
        name: d.name,
        category: d.modalities.join(' / '),
        version: d.versionId,
        status: {
          ready: 'succeeded',
          uploading: 'pending',
          processing: 'running',
          archived: 'cancelled',
        }[d.status],
        description: d.description,
      })),
    )
    if (items.length >= result.total) break
    if (!result.items.length) throw new Error('资源目录分页不完整')
    page++
  }
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: items.length || 100,
    totalPages: items.length ? 1 : 0,
  }
}
