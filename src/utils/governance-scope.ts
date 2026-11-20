export interface GovernanceScope {
  datasetId: number
  versionId: string
  language: string
  schemeId: string
}
export function assertResultScope(
  result: { scope: GovernanceScope } | null,
  scope: GovernanceScope,
) {
  if (
    result &&
    (result.scope.datasetId !== scope.datasetId ||
      result.scope.versionId !== scope.versionId ||
      result.scope.language !== scope.language ||
      result.scope.schemeId !== scope.schemeId)
  )
    throw new Error('返回结果与当前资源版本、语种或方案不一致')
}

interface ScopeOptions {
  datasets: {
    id: number
    versions: { id: string; languages: (string | { code: string })[] }[]
  }[]
  schemes: { id: string }[]
}

export function initialGovernanceScope(
  options: ScopeOptions,
  saved: Partial<GovernanceScope>,
  defaults: Partial<GovernanceScope>,
  allLanguages: boolean,
): GovernanceScope {
  const available = options.datasets.filter((dataset) => dataset.versions.length)
  const dataset =
    available.find((item) => item.id === saved.datasetId) ??
    available.find((item) => item.id === defaults.datasetId) ??
    available[0]
  const savedVersion =
    dataset?.id === saved.datasetId
      ? dataset?.versions.find((item) => item.id === saved.versionId)
      : undefined
  const version =
    savedVersion ??
    dataset?.versions.find((item) => item.id === defaults.versionId) ??
    dataset?.versions[0]
  const languages =
    version?.languages.map((item) => (typeof item === 'string' ? item : item.code)) ?? []
  const selectedLanguage = savedVersion ? saved.language : undefined
  const validLanguage = (code?: string) =>
    code === 'all' || (code !== undefined && languages.includes(code))
  let language = 'all'
  if (!allLanguages) {
    if (selectedLanguage && validLanguage(selectedLanguage)) language = selectedLanguage
    else if (defaults.language && validLanguage(defaults.language)) language = defaults.language
    else language = languages[0] ?? 'all'
  }
  const scheme =
    options.schemes.find((item) => item.id === saved.schemeId) ??
    options.schemes.find((item) => item.id === defaults.schemeId) ??
    options.schemes[0]
  return {
    datasetId: dataset?.id ?? 0,
    versionId: version?.id ?? '',
    language,
    schemeId: scheme?.id ?? '',
  }
}

export function hasGovernanceScope(scope: GovernanceScope) {
  return !!(scope.datasetId && scope.versionId && scope.language && scope.schemeId)
}
