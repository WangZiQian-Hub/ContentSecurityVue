import { beforeEach, describe, expect, it, vi } from 'vitest'
const backend = vi.hoisted(() => ({ isMock: true, request: vi.fn() }))
vi.mock('./request', () => backend)
import {
  getSummary,
  listDatasets,
  listIngestTasks,
  startIngest,
  uploadResourceFile,
} from './data-resource'
import { getKpis } from './kpi'
describe('数据资源接口与示例数据', () => {
  beforeEach(() => {
    backend.isMock = true
    backend.request.mockReset()
  })
  it('四个页面有独立指标配置，字段可以用于卡片渲染', async () => {
    for (const [view, count] of [
      ['overview', 6],
      ['ingest', 4],
      ['datasets', 4],
      ['statistics', 6],
    ] as const) {
      const kpis = await getKpis(`resource-${view}`)
      expect(kpis).toHaveLength(count)
      expect(new Set(kpis.map((item) => item.id)).size).toBe(count)
      for (const item of kpis) expect(Number.isFinite(item.value)).toBe(true)
      // 报表快照与卡片共用一份示例配置，避免两处手动维护。
      expect((await getSummary(view)).kpis).toEqual(kpis)
    }
  })
  it('四个页面在真实模式下使用统一 KPI 接口和各自的 kind', async () => {
    backend.isMock = false
    backend.request.mockResolvedValue([])
    for (const kind of [
      'resource-overview',
      'resource-ingest',
      'resource-datasets',
      'resource-statistics',
    ]) {
      await getKpis(kind)
      expect(backend.request).toHaveBeenLastCalledWith({
        url: '/kpis',
        method: 'GET',
        params: { kind },
      })
    }
  })
  it('组合筛选先于分页，页码与总数一致', async () => {
    const filtered = await listDatasets({
      page: 1,
      pageSize: 1,
      sourceType: 'business',
      language: 'zh',
    })
    expect(filtered.total).toBe(2)
    expect(filtered.items).toHaveLength(1)
    const second = await listDatasets({
      page: 2,
      pageSize: 1,
      sourceType: 'business',
      language: 'zh',
    })
    expect(second.items[0]?.id).not.toBe(filtered.items[0]?.id)
    const empty = await listDatasets({ page: 1, pageSize: 10, keyword: '不存在的数据集' })
    expect(empty.total).toBe(0)
    expect(empty.items).toEqual([])
  })
  it('接入任务同时按关键词和状态筛选', async () => {
    const data = await listIngestTasks({
      page: 1,
      pageSize: 10,
      keyword: '视频',
      status: 'running',
    })
    expect(data.items).toHaveLength(1)
    expect(data.items[0]?.name).toContain('视频')
    expect(data.items[0]?.status).toBe('running')
  })
  it('真实模式传递统计筛选，不回退至示例数据', async () => {
    backend.isMock = false
    backend.request.mockRejectedValue(new Error('offline'))
    await expect(
      getSummary('statistics', { language: 'en', startDate: '2026-09-01' }),
    ).rejects.toThrow('offline')
    expect(backend.request).toHaveBeenCalledWith({
      url: '/data-resources/summary',
      params: { view: 'statistics', language: 'en', startDate: '2026-09-01' },
    })
  })
  it('文件上传保留二进制，任务写入使用统一能力入口', async () => {
    backend.request.mockResolvedValue({ fileId: 'file_1' })
    await uploadResourceFile(new File(['sample'], 'sample.txt', { type: 'text/plain' }))
    const upload = backend.request.mock.calls[0]?.[0] as { data: FormData }
    expect(upload.data.get('file')).toBeInstanceOf(Blob)
    const payload = { capabilityCode: 'data_ingest', input: { datasetId: 1, files: ['file_1'] } }
    await startIngest(payload)
    expect(backend.request).toHaveBeenLastCalledWith({
      url: '/tasks/execute',
      method: 'POST',
      data: payload,
      timeout: 300000,
    })
  })
})
