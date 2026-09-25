import { resourceDatasets } from './resource-catalog'
import type { ResourceSample } from '../types/data-resource'

export const resourceSamples: ResourceSample[] = resourceDatasets.flatMap((dataset) =>
  Array.from({ length: 120 }, (_, index) => ({
    id: `sample_${dataset.id}_${String(index + 1).padStart(5, '0')}`,
    datasetId: dataset.id,
    versionId: dataset.versionId,
    language: index < 2 ? 'zh' : dataset.languages[index % dataset.languages.length]!,
    text:
      index === 0
        ? '【新闻】2026/09/20  北京 · 中美科技交流会召开，双方表示将进一步加强交流。'
        : index === 1
          ? '用户ID：10086 ；    国家/地区：中国\n注册时间：2026/9/20 14:30:00'
          : dataset.languages[index % dataset.languages.length] === 'en'
            ? `Community traditions: families share local stories at the annual festival. Record ${index + 1}.`
            : dataset.languages[index % dataset.languages.length] === 'ja'
              ? `地域の祭りでは伝統工芸を紹介し、住民が交流します。記録 ${index + 1}。`
              : `社区节庆活动记录 ${index + 1}：居民展示传统手工艺，讲述地方习俗与文化传承。`,
  })),
)
