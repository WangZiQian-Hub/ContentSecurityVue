import { resourceDatasets } from './resource-catalog'
import { resourceSamples } from './resource-samples'
import { languageName } from '../utils/governance-language'
import type { ResourceSample } from '../types/data-resource'
import type { GovernanceResource } from '../types/governance-resources'
type SnapshotSample = ResourceSample & { metadata?: Record<string, string> }
const versions = new Map<string, { datasetId: number; label: string; samples: SnapshotSample[] }>()
export function registerResourceVersion(
  datasetId: number,
  versionId: string,
  samples: SnapshotSample[],
  label = versionId,
) {
  if (
    !resourceDatasets.some((d) => d.id === datasetId) ||
    versions.has(versionId) ||
    resourceDatasets.some((d) => d.versionId === versionId)
  )
    throw new Error('数据集不存在或版本已存在')
  if (
    samples.some((s) => s.datasetId !== datasetId || s.versionId !== versionId) ||
    new Set(samples.map((s) => s.id)).size !== samples.length
  )
    throw new Error('版本样本归属不一致或ID重复')
  versions.set(versionId, { datasetId, label, samples: structuredClone(samples) })
}
export function resourceVersionSamples(datasetId: number, versionId: string): SnapshotSample[] {
  const saved = versions.get(versionId)
  if (saved) {
    if (saved.datasetId !== datasetId) throw new Error('资源版本不属于当前数据集')
    return structuredClone(saved.samples)
  }
  if (!resourceDatasets.some((d) => d.id === datasetId && d.versionId === versionId))
    throw new Error('资源版本不存在')
  return structuredClone(
    resourceSamples.filter((s) => s.datasetId === datasetId && s.versionId === versionId),
  )
}
export function governanceResources(): GovernanceResource[] {
  return resourceDatasets.map((d) => ({
    id: d.id,
    name: d.name,
    versions: [
      {
        id: d.versionId,
        label: d.versionId,
        languages: d.languages.map((code) => ({ code, name: languageName(code) })),
      },
      ...[...versions]
        .filter(([, v]) => v.datasetId === d.id)
        .map(([id, v]) => ({
          id,
          label: v.label,
          languages: [...new Set(v.samples.map((s) => s.language))].map((code) => ({
            code,
            name: languageName(code),
          })),
        })),
    ],
  }))
}
export function validateResourceScope(scope: {
  datasetId: number
  versionId: string
  language?: string
}) {
  const version = governanceResources()
    .find((d) => d.id === scope.datasetId)
    ?.versions.find((v) => v.id === scope.versionId)
  if (
    !version ||
    (scope.language &&
      scope.language !== 'all' &&
      !version.languages.some((l) => l.code === scope.language))
  )
    throw new Error('资源版本或语种不属于当前数据集')
}
// 既有已完成清洗任务的输出快照，与输入共享样本ID，正文使用保存的清洗结果。
for (const [datasetId, versionId] of [
  [1, 'demo_dsv_output_001'],
  [4, 'demo_dsv_output_002'],
] as const) {
  const samples = resourceSamples
    .filter((s) => s.datasetId === datasetId)
    .map((s, i) => ({
      ...s,
      versionId,
      text:
        i === 0
          ? '【新闻】2026-09-20 北京 中美科技交流会召开，双方表示将进一步加强交流。'
          : i === 1
            ? '用户ID：10086；国家/地区：中国\n注册时间：2026-09-20 14:30:00'
            : s.text,
    }))
  registerResourceVersion(datasetId, versionId, samples)
}
