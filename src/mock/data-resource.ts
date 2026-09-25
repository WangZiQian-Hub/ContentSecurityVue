import type { IngestTask, ResourceSummary, ResourceView } from '../types/data-resource'
import { getMockKpis } from './kpis'
import { names } from './resource-catalog'
export { resourceDatasets } from './resource-catalog'
export const ingestTasks: IngestTask[] = [
  '社交媒体文本数据接入',
  '视频内容采集接入',
  '新闻资讯数据同步',
  '图片数据批量接入',
  '音频数据接入',
].map((name, index) => ({
  taskId: `demo_ingest_${index + 1}`,
  name,
  sourceName: ['本地文件', '网络采集', 'API接口', '对象存储', '数据库'][index]!,
  datasetName: names[index]!,
  storageGb: [245.6, 512.3, 86.7, 320.1, 73.5][index]!,
  progress: [100, 72, 45, 100, 18][index]!,
  status: (['succeeded', 'running', 'running', 'succeeded', 'failed'] as const)[index]!,
  createdAt: `2024-12-${index < 3 ? 15 : 14}T${String(14 - index).padStart(2, '0')}:32:00+08:00`,
  successCount: 8642,
  duplicateCount: 126,
  anomalyCount: 18,
  traceId: `demo_trace_${index + 1}`,
}))
export function getResourceSummary(view: ResourceView): ResourceSummary {
  const distribution = (labels: string[], values: number[]) =>
    labels.map((name, index) => ({ name, value: values[index]! }))
  return {
    // 报表快照沿用同一份 KPI 配置，顶部卡片由 /kpis 独立请求。
    kpis: getMockKpis(`resource-${view}`),
    trend: {
      dates: [
        '2024-12-09',
        '2024-12-10',
        '2024-12-11',
        '2024-12-12',
        '2024-12-13',
        '2024-12-14',
        '2024-12-15',
      ],
      added: [68, 92, 118, 102, 156, 132, 178],
      total: [100, 168, 240, 290, 350, 420, 468],
    },
    modalities: distribution(['文本', '图片', '音频', '视频'], [42.3, 28.6, 18.7, 10.4]),
    sources: distribution(
      ['本地文件', 'API接口', '数据库', '网络采集', '对象存储'],
      [32.4, 24.6, 18.7, 14.3, 10],
    ),
    languages: distribution(
      ['中文', '英文', '日文', '阿拉伯文', '其他'],
      [68.4, 18.7, 7.2, 3.6, 2.1],
    ),
    quality: distribution(
      ['完整性', '准确性', '一致性', '规范性', '可用性'],
      [96.2, 94.8, 92.1, 93.6, 95.3],
    ),
    qualityScore: 95.6,
    issues: distribution(['重复数据', '缺失字段', '异常文件', '接入失败'], [12680, 3286, 126, 38]),
    ranking: ingestTasks.map((task, index) => ({
      name: task.name,
      source: task.sourceName,
      storageGb: task.storageGb,
      uses: [12680, 10342, 8560, 6328, 4210][index]!,
      share: [28.4, 23.1, 19.1, 14.2, 9.4][index]!,
    })),
  }
}
