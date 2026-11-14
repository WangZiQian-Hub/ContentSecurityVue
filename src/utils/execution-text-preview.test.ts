import { describe, expect, it } from 'vitest'
import { executionTextTokens } from './execution-text-preview'

describe('execution content display', () => {
  it('renders escaped and existing line breaks while preserving highlight positions', () => {
    const text = '第一行\\n关键内容\n第三行'
    const start = text.indexOf('关键内容')
    const content = { text, highlights: [{ start, end: start + 4 }] }
    const result = executionTextTokens(content)
    expect(result.map(t => t.text).join('')).toBe('第一行\n关键内容\n第三行')
    expect(result.filter(t => t.mark).map(t => t.text).join('')).toBe('关键内容')
    expect(content.text).toBe(text)
  })
  it('indents JSON, displays string line breaks and retains exact numbers', () => {
    const text = '{"content":"line one\\nline two","rows":[1,9007199254740993],"empty":{}}'
    const output = executionTextTokens({ text, highlights: [] }).map(t => t.text).join('')
    expect(output).toContain('\n  "content": "line one\nline two",')
    expect(output).toContain('\n  "rows": [\n    1,\n    9007199254740993\n  ]')
    expect(output).toContain('"empty": {}')
  })
  it('preserves escaped quotes, paths, plain HTML text and truncated JSON', () => {
    const text = '{"path":"C:\\\\new","message":"say \\"hello\\""}'
    expect(executionTextTokens({ text, highlights: [] }).map(t => t.text).join('')).toContain('C:\\\\new')
    expect(executionTextTokens({ text: '<script>text</script>\\nnext', highlights: [] }).map(t => t.text).join('')).toBe('<script>text</script>\nnext')
    expect(executionTextTokens({ text: '{"content":"partial', highlights: [] }).map(t => t.text).join('')).toBe('{"content":"partial')
  })
})
