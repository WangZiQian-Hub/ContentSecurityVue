import { describe, expect, it } from 'vitest'
import { traceSourceLocation } from './trace-preview'

describe('原始位置的通俗显示', () => {
  it('从零开始的索引转为用户可读的消息和调用序号', () => {
    expect(traceSourceLocation('messages[2].tool_calls[0]')).toBe('第 3 条消息 · 第 1 个工具调用')
    expect(traceSourceLocation('messages[0].content')).toBe('第 1 条消息 · 消息内容')
  })
  it('支持运行节点、嵌套样本和事件', () => {
    expect(traceSourceLocation('runs[3]')).toBe('第 4 个运行节点')
    expect(traceSourceLocation('$.samples[0].events[2]')).toBe('第 1 条样本 · 第 3 个事件')
  })
  it('不猜测未知路径，保留原始位置以供核对', () => {
    expect(traceSourceLocation('custom[2].input')).toBe('custom[2].input')
    expect(traceSourceLocation('$')).toBe('整条原始记录')
    expect(traceSourceLocation()).toBe('未提供')
  })
})
