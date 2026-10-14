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
  // 列表接口返回的是摘要（不含 input），此时退回服务端版本号或占位符，
  // 避免在表格单元格渲染时抛异常导致整行错位。
  return task.input?.outputVersionName?.trim() || task.outputVersion || '—'
}
