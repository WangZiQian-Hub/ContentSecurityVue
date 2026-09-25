import { resourceDatasets } from './data-resource'
import type { ProcessOptions, ProcessTask } from '../types/data-governance'
export const processOptions: ProcessOptions = {
  datasets: resourceDatasets.map((dataset) => ({
    id: dataset.id,
    name: dataset.name,
    versions: [{ versionId: dataset.versionId, label: `当前版本 · ${dataset.versionId}` }],
  })),
  rules: [
    {
      code: 'normalize_text',
      label: '文本规范化',
      description: '去除多余空格，统一换行、标点与日期格式。',
    },
    { code: 'deduplicate', label: '精确去重', description: '识别完全相同的数据，按规则保留一条。' },
    {
      code: 'normalize_encoding',
      label: '编码统一',
      description: '将可正确解码的内容统一为 UTF-8；解码失败保留错误记录。',
    },
    {
      code: 'complete_fields',
      label: '字段补全',
      description: '仅从可信元数据、映射表或明确规则补齐；无法确定时标为缺失，不生成未知内容。',
    },
  ],
  templates: [
    {
      id: 'standard',
      name: '标准清洗流程',
      rules: ['normalize_text', 'deduplicate', 'normalize_encoding', 'complete_fields'],
    },
    { id: 'deduplicate', name: '去重与补全', rules: ['deduplicate', 'complete_fields'] },
    { id: 'normalize', name: '格式规范化', rules: ['normalize_text', 'normalize_encoding'] },
  ],
}
// 只读演示快照，不创建任务、不模拟进度、不生成输出版本。
export const processTasks: ProcessTask[] = [0, 1, 2].map((index) => ({
  taskId: `demo_process_00${8 - index}`,
  name: `清洗任务00${8 - index}`,
  datasetName: resourceDatasets[[2, 0, 3][index]!]!.name,
  input: {
    datasetId: [3, 1, 4][index]!,
    datasetVersionId: resourceDatasets[[2, 0, 3][index]!]!.versionId,
    scope: 'all',
    rules: processOptions.templates[index]!.rules,
    templateId: processOptions.templates[index]!.id,
  },
  ruleName: processOptions.templates[index]!.name,
  outputVersion: index === 0 ? null : `demo_dsv_output_00${index}`,
  status: index === 0 ? 'running' : 'succeeded',
  progress: index === 0 ? 76 : 100,
  processedCount: index === 0 ? 203984 : 268400,
  totalCount: 268400,
  remainingSeconds: index === 0 ? 120 : null,
  steps: ['读取数据', '规范化', '去重', '字段校验', '生成版本'].map((name, step) => ({
    name,
    status: index !== 0 || step < 3 ? 'succeeded' : step === 3 ? 'running' : 'pending',
  })),
  comparisons: [
    {
      id: '1',
      original: '【新闻】2026/09/20  北京 · 中美科技交流会召开，双方表示将进一步加强交流。',
      processed: '【新闻】2026-09-20 北京 中美科技交流会召开，双方表示将进一步加强交流。',
      actions: ['日期格式统一', '去除多余空格'],
      fields: [
        { name: '日期', before: '2026/09/20', after: '2026-09-20' },
        { name: '城市', before: ' 北京 ', after: '北京' },
      ],
    },
    {
      id: '2',
      original: '用户ID：10086 ；    国家/地区：中国\n注册时间：2026/9/20 14:30:00',
      processed: '用户ID：10086；国家/地区：中国\n注册时间：2026-09-20 14:30:00',
      actions: ['空格规范化', '时间格式统一'],
      fields: [
        { name: '用户ID', before: '10086', after: '10086' },
        { name: '注册时间', before: '2026/9/20 14:30:00', after: '2026-09-20 14:30:00' },
      ],
    },
  ],
  createdAt: '2026-09-24T09:30:00+08:00',
  finishedAt: index === 0 ? null : `2026-09-24T09:${index === 1 ? '52' : '36'}:00+08:00`,
  traceId: `demo_trace_process_${index}`,
}))
