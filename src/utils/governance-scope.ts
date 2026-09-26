interface Scope {
  datasetId: number
  versionId: string
  language: string
  schemeId: string
}
export function assertResultScope(result: { scope: Scope } | null, scope: Scope) {
  if (
    result &&
    (result.scope.datasetId !== scope.datasetId ||
      result.scope.versionId !== scope.versionId ||
      result.scope.language !== scope.language ||
      result.scope.schemeId !== scope.schemeId)
  )
    throw new Error('返回结果与当前资源版本、语种或方案不一致')
}
