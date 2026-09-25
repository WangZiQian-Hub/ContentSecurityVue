import { resourceDatasets } from './resource-catalog'
import { resourceSamples } from './resource-samples'
import type { ValueOptions, ValueResult, ValueSample, ValueScope } from '../types/data-value'
import type { Kpi } from '../types'

export function getValueKpis(): Kpi[] {
  const samples = savedResults
    .filter(({ result }) => result.scope.language === 'all')
    .flatMap(({ samples }) => samples)
  const valid = samples.filter((item) => item.score !== null)
  const values = [
    Number((valid.reduce((sum, item) => sum + item.score!, 0) / valid.length).toFixed(1)),
    Number(((valid.filter((item) => item.tier === 'high').length / valid.length) * 100).toFixed(1)),
    valid.length,
    new Set(samples.map((item) => item.language)).size,
  ]
  return ['综合价值评分', '高价值语料占比', '已分析语料', '覆盖语种'].map((label, index) => ({
    id: `value-${index}`,
    label,
    value: values[index]!,
    unit: ['分', '%', '条', '种'][index]!,
    icon: ['Trophy', 'Document', 'Coin', 'Position'][index]!,
    changeRate: 0,
  }))
}

export const valueOptions: ValueOptions = {
  datasets: [3, 1].map((id) => {
    const dataset = resourceDatasets.find((item) => item.id === id)!
    return {
      id,
      name: dataset.name,
      versions: [dataset.versionId, `${dataset.versionId}_previous`].map((versionId) => ({
        id: versionId,
        label: versionId,
        languages: dataset.languages.map((code) => ({
          code,
          name: ({ zh: '中文', en: '英文', ja: '日文' } as Record<string, string>)[code]!,
        })),
      })),
    }
  }),
  schemes: [
    {
      id: 'general-v1',
      name: '通用价值评价 v1.0',
      description: '文化价值、信息价值、稀缺性、可信度、代表性五维等权；综合分为五维算术均值。',
      highThreshold: 85,
      mediumThreshold: 60,
    },
    {
      id: 'general-v2',
      name: '通用价值评价 v2.0（尚未分析）',
      description: '五维等权，高价值阈值 90 分；独立方案版本。',
      highThreshold: 90,
      mediumThreshold: 60,
    },
  ],
}
const dimensionNames = ['文化价值', '信息价值', '稀缺性', '可信度', '代表性']
export function valueResultId(scope: ValueScope) {
  return `demo_value_${scope.datasetId}_${scope.versionId}_${scope.language}_${scope.schemeId}`
}
export function demoScope(id: string): ValueScope {
  for (const dataset of valueOptions.datasets)
    for (const version of dataset.versions)
      for (const language of [...version.languages.map((item) => item.code), 'all']) {
        const scope = {
          datasetId: dataset.id,
          versionId: version.id,
          language,
          schemeId: 'general-v1',
        }
        if (valueResultId(scope) === id) return scope
      }
  throw new Error('示例分析结果不存在')
}
export function demoSamples(scope: ValueScope): ValueSample[] {
  const languages = valueOptions.datasets
    .find((item) => item.id === scope.datasetId)!
    .versions.find((item) => item.id === scope.versionId)!.languages
  const offset = scope.datasetId === 1 ? 3 : 0
  const rows: ValueSample[] = resourceSamples
    .filter(
      (sample) => sample.datasetId === scope.datasetId && sample.versionId === scope.versionId,
    )
    .map((sample, index) => {
      const score =
        index >= 118
          ? null
          : Math.max(
              5,
              ([94, 92, 89, 86, 84, 83, 82, 81, 80, 79][index] ??
                (index < 88 ? 86 + (index % 11) : 10 + (index % 70))) - offset,
            )
      const language = languages.find((item) => item.code === sample.language)!
      return {
        id: sample.id,
        text: sample.text,
        language: language.name,
        score,
        tier:
          score === null ? 'unavailable' : score >= 85 ? 'high' : score >= 60 ? 'medium' : 'low',
        dimensions:
          score === null
            ? []
            : dimensionNames.map((name, d) => ({
                name,
                score: score + [2, 1, -2, -1, 0][d]!,
                evidence: [sample.text],
                reason: [
                  '包含文化背景与习俗说明',
                  '内容完整，含具体事例',
                  '演示评分；稀缺性需结合资源库比对',
                  '演示评分；真实性仍需外部核验',
                  '覆盖当前主题的典型表达',
                ][d]!,
              })),
        unavailableReason: score === null ? '正文信息不足，无法形成可靠评分' : undefined,
      }
    })
  const selectedLanguage = languages.find((item) => item.code === scope.language)
  return selectedLanguage ? rows.filter((item) => item.language === selectedLanguage.name) : rows
}
export function demoResult(scope: ValueScope): ValueResult {
  const dataset = valueOptions.datasets.find((item) => item.id === scope.datasetId)!
  const version = dataset.versions.find((item) => item.id === scope.versionId)!
  const samples = demoSamples(scope)
  const valid = samples.filter((item) => item.score !== null)
  return {
    id: valueResultId(scope),
    taskId: `demo_task_${valueResultId(scope)}`,
    scope: { ...scope },
    datasetName: dataset.name,
    versionLabel: version.label,
    languageName:
      scope.language === 'all'
        ? '全部语种'
        : version.languages.find((item) => item.code === scope.language)!.name,
    schemeName: valueOptions.schemes[0]!.name,
    finishedAt: '2026-09-25T10:24:00+08:00',
    meanScore: valid.length
      ? Number((valid.reduce((sum, item) => sum + item.score!, 0) / valid.length).toFixed(1))
      : null,
    validCount: valid.length,
    highCount: valid.filter((item) => item.tier === 'high').length,
    unavailableCount: samples.length - valid.length,
    failedCount: 0,
    targetCount: samples.length,
    languages: [...new Set(samples.map((item) => item.language))],
    highThreshold: 85,
    mediumThreshold: 60,
    dimensions: dimensionNames.map((name, index) => ({
      name,
      score: Number(
        (
          valid.reduce((sum, item) => sum + item.dimensions[index]!.score, 0) / valid.length
        ).toFixed(1),
      ),
      reason: '当前有效评分样本的维度均值；权重 20%',
    })),
    bins: Array.from({ length: 5 }, (_, index) => ({
      id: String(index),
      label: `${index * 20}–${(index + 1) * 20}`,
      count: valid.filter((item) => Math.min(4, Math.floor(item.score! / 20)) === index).length,
    })),
  }
}

const savedScopes: ValueScope[] = valueOptions.datasets.flatMap((dataset) =>
  ['all', 'zh'].map((language) => ({
    datasetId: dataset.id,
    versionId: dataset.versions[0]!.id,
    language,
    schemeId: 'general-v1',
  })),
)
const savedResults = savedScopes.map((scope) => ({
  result: demoResult(scope),
  samples: demoSamples(scope),
}))
export function latestDemoResult(scope: ValueScope): ValueResult | null {
  return structuredClone(
    savedResults.find(
      ({ result }) =>
        result.scope.datasetId === scope.datasetId &&
        result.scope.versionId === scope.versionId &&
        result.scope.language === scope.language &&
        result.scope.schemeId === scope.schemeId,
    )?.result ?? null,
  )
}
export function savedDemoResult(id: string) {
  const saved = savedResults.find(({ result }) => result.id === id)
  if (!saved) throw new Error('演示分析结果不存在')
  return structuredClone(saved)
}
