import type { ProcessOptions, ProcessTask } from '../types/data-governance'

export function validateOutputVersionName(
  name: string,
  versions: ProcessOptions['datasets'][number]['versions'],
) {
  const normalized = name.trim()
  if (!normalized) return '请输入输出版本。'
  if (normalized.length > 64) return '输出版本不能超过 64 个字符。'
  if (
    versions.some(
      (version) => version.versionId === normalized || version.label.trim() === normalized,
    )
  )
    return '该数据集已存在此版本，请填写新的输出版本。'
  return ''
}

export function processOutputVersionLabel(task: ProcessTask) {
  return task.input.outputVersionName?.trim() || task.outputVersion || '—'
}
