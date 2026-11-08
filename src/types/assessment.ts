/** Optional for historical records saved before availability metadata was introduced. */
export interface Assessment {
  assessmentStatus?: 'assessed' | 'partial' | 'unavailable'
  unavailableFields?: string[]
  assessmentReason?: string | null
}

export function assessmentLabel(value?: Assessment | null): string {
  return value?.assessmentStatus === 'unavailable'
    ? '无法判断'
    : value?.assessmentStatus === 'partial'
      ? '部分可判断'
      : value?.assessmentStatus === 'assessed' ? '正常分析' : ''
}

export function analysisError(code?: string | null, message?: string | null): string {
  if (['invalid_structured_output', 'invalid_struct_output', 'result_validation_failed'].includes(code || ''))
    return '历史模型结果未通过校验，当时未形成有效结论。可重新分析。'
  return (message || '模型服务未返回结果。').replace(/invalid_struct(?:ured)?_output/g, '模型结果无法解析')
}
