import type { ResourceDataset } from '../types/data-resource'
export const DEMO_SAMPLE_COUNT = 120
export const names = [
  '内容安全多模态数据集',
  '社交媒体中文语料库',
  '跨文化交流多语种数据集',
  '新闻资讯数据集',
  '短视频风险样本集',
  '政务服务问答数据集',
]
// 每行均为一次已登记的存储增量事件（GB）；七日合计等于该数据集当前存储量。
const storageDeltas = [
  [200, 240, 260, 300, 270, 310, 280],
  [40, 35, 50, 45, 60, 55, 35.5],
  [50, 70, 65, 80, 75, 65, 75.2],
  [30, 40, 35, 45, 50, 40, 40.1],
  [70, 90, 85, 110, 100, 95, 100.8],
  [10, 15, 20, 18, 17, 20, 20.4],
] as const
const qualityScores = [96.8, 92.1, 89.5, 87.3, 82.7, 90.6] as const
const qualityNames = ['完整性', '准确性', '一致性', '时效性', '可用性'] as const
const qualityOffsets = [-2, -1, 0, 1, 2] as const
const issueCounts = [
  [2, 1, 0, 1],
  [3, 2, 1, 1],
  [4, 2, 2, 1],
  [5, 3, 2, 2],
  [8, 5, 4, 3],
  [3, 2, 1, 1],
] as const
const issueNames = ['缺失字段', '重复记录', '格式异常', '低置信度'] as const
const usageCounts = [85, 67, 41, 33, 19, 12] as const
export const resourceDatasets: ResourceDataset[] = names.map((name, index) => ({
  id: index + 1,
  name,
  sourceType: (['business', 'internet', 'industry', 'internet', 'internet', 'business'] as const)[
    index
  ]!,
  sourceName: ['本地文件', '网络采集', '第三方合作', '新闻爬虫', '抖音开放平台', '本地文件'][
    index
  ]!,
  modalities: index === 0 ? ['文本', '图片', '视频'] : index === 4 ? ['视频'] : ['文本'],
  languages: index === 2 ? ['zh', 'en', 'ja'] : index === 0 || index === 4 ? ['zh', 'en'] : ['zh'],
  rowCount: DEMO_SAMPLE_COUNT,
  storageGb: Math.round(storageDeltas[index]!.reduce((sum, delta) => sum + delta, 0) * 10) / 10,
  qualityScore: qualityScores[index]!,
  qualityStatus: index === 4 ? 'poor' : index < 2 ? 'excellent' : 'good',
  status: index === 2 ? 'processing' : 'ready',
  versionId: `dsv_00000${index + 1}`,
  owner: '内容安全团队',
  description: '面向内容安全治理的数据资源，用于模型训练、评测和治理策略优化。此处为界面展示示例。',
  createdAt: '2026-09-20T10:24:00+08:00',
  updatedAt: '2026-09-26T18:00:00+08:00',
  statistics: {
    qualityDimensions: qualityNames.map((dimension, i) => ({
      name: dimension,
      value: Math.round((qualityScores[index]! + qualityOffsets[i]!) * 10) / 10,
    })),
    issues: issueNames.map((issue, i) => ({ name: issue, value: issueCounts[index]![i]! })),
    usageCount: usageCounts[index]!,
    storageEvents: storageDeltas[index]!.map((deltaGb, i) => ({
      at: `2026-09-${String(20 + i).padStart(2, '0')}T18:00:00+08:00`,
      deltaGb,
    })),
  },
}))
