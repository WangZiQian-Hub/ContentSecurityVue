import type { ResourceDataset } from '../types/data-resource'
export const names = [
  '内容安全多模态数据集',
  '社交媒体中文语料库',
  '跨文化交流多语种数据集',
  '新闻资讯数据集',
  '短视频风险样本集',
  '政务服务问答数据集',
]
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
  rowCount: [12680000, 8520000, 6320000, 4950000, 3210000, 1860000][index]!,
  storageGb: [1860, 320.5, 480.2, 280.1, 650.8, 120.4][index]!,
  qualityScore: [96.8, 92.1, 89.5, 87.3, 82.7, 90.6][index]!,
  qualityStatus: index === 4 ? 'poor' : index < 2 ? 'excellent' : 'good',
  status: index === 2 ? 'processing' : 'ready',
  versionId: `dsv_00000${index + 1}`,
  owner: '内容安全团队',
  description: '面向内容安全治理的数据资源，用于模型训练、评测和治理策略优化。此处为界面展示示例。',
  createdAt: '2024-10-08T10:24:00+08:00',
  updatedAt: `2024-12-${15 - Math.floor(index / 2)}T14:32:00+08:00`,
}))
