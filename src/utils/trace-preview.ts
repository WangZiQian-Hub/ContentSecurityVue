import type { Detail } from '../types/agent-traces'

/** Translate only known path segments; never guess the meaning of an unknown path. */
export function traceSourceLocation(path?: string): string {
  if (!path) return '未提供'
  if (path === '$') return '整条原始记录'
  const names: Record<string, string> = {
    messages: '条消息', tool_calls: '个工具调用', runs: '个运行节点',
    events: '个事件', samples: '条样本', tool_events: '条工具记录',
  }
  const parts = path.replace(/^\$\./, '').split('.')
  const translated: string[] = []
  for (const part of parts) {
    const match = /^(\w+)\[(\d+)\]$/.exec(part)
    if (match && names[match[1]!]) translated.push(`第 ${Number(match[2]) + 1} ${names[match[1]!]}`)
    else if (part === 'content') translated.push('消息内容')
    else return path
  }
  return translated.join(' · ')
}

type MappingRow = Detail['mapping']['rows'][number]
const row = (sourcePath: string, targetPath: string, description: string): MappingRow =>
  ({ sourcePath, targetPath, description, state: 'mapped' })

/** Format-level reading guide, separate from the selected event's actual values. */
export function traceFieldGuide(detail: Detail): MappingRow[] {
  if (detail.sourceFormat === 'openai_messages') return [
    row('messages[].role', 'event.role', '这条消息由谁发出（用户 / AI / 工具）'),
    row('messages[].tool_calls[].function.name', 'event.toolName', '这次调用使用哪个工具'),
    row('messages[].tool_calls[].function.arguments', 'event.inputJson', '调用工具时传入的参数'),
    row('messages[].tool_calls[].id / messages[].tool_call_id', 'event.callId', '用于配对工具请求和返回；平台调用编号见详细编号'),
  ]
  if (detail.sourceFormat === 'langchain_trace') return [
    row('runs[].run_type', 'event.eventType', '根据运行节点类型识别这一步做了什么'),
    row('runs[].name', 'event.toolName', '工具节点使用的工具名称'),
    row('runs[].inputs', 'event.inputJson', '传给这个节点的输入'),
    row('runs[].outputs', 'event.outputJson', '这个节点返回的结果'),
    row('runs[].id', 'event.callId', '工具节点的标识用于关联调用记录'),
  ]
  if (detail.sourceFormat === 'agent_trajectory') return [
    row('events[].type', 'event.eventType', '这一步的事件类型'),
    row('events[].tool', 'event.toolName', '这一步使用的工具'),
    row('events[].tool_args', 'event.inputJson', '调用工具时传入的参数'),
    row('events[].content', 'event.outputJson', '工具返回的内容'),
    row('events[].step_id / events[].tool', 'event.callId', '根据步骤和工具关联请求与返回'),
  ]
  // Keep genuine field-level mappings for other formats; generated metadata and
  // whole-record locators belong in the explanatory note / technical details.
  return detail.mapping.rows.filter(r => r.state === 'mapped' &&
    r.targetPath !== 'event' && !/[\u3400-\u9fff]/.test(r.sourcePath))
}
