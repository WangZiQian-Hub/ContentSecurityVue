import type { ExecutionText } from '../types/agent-trace-execution'

/** Format display text without rewriting the source or losing highlight offsets. */
export function executionTextTokens(content?: ExecutionText) {
  if (!content) return [{ text: '未提供', mark: false }]
  const source = content.text
  let structured = false
  try {
    const value = JSON.parse(source)
    structured = value !== null && typeof value === 'object'
  } catch { /* Truncated JSON and plain text remain readable. */ }
  const out: { text: string; mark: boolean }[] = []
  function emit(text: string, start = -1, end = start + 1) {
    const mark = start >= 0 && content!.highlights.some(r => r.start < end && r.end > start)
    const last = out[out.length - 1]
    if (last?.mark === mark) last.text += text
    else out.push({ text, mark })
  }
  let quoted = false, depth = 0
  const newline = () => emit('\n' + '  '.repeat(depth))
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!
    if (c === '\\' && (!structured || quoted)) {
      const next = source[i + 1]
      if (source.slice(i, i + 4) === '\\r\\n') { emit('\n', i, i + 4); i += 3; continue }
      if (next === 'n' || next === 'r') { emit('\n', i, i + 2); i++; continue }
      if (next === 't') { emit('  ', i, i + 2); i++; continue }
      if (next !== undefined) { emit(c + next, i, i + 2); i++; continue }
    }
    if (structured) {
      if (c === '"') quoted = !quoted
      if (!quoted) {
        if (/\s/.test(c)) continue
        if (c === '{' || c === '[') {
          emit(c, i); depth++
          if (source.slice(i + 1).trimStart()[0] !== (c === '{' ? '}' : ']')) newline()
          continue
        }
        if (c === '}' || c === ']') {
          depth = Math.max(0, depth - 1)
          const previous = source.slice(0, i).trimEnd().slice(-1)
          if (previous !== '{' && previous !== '[') newline()
          emit(c, i); continue
        }
        if (c === ',') { emit(c, i); newline(); continue }
        if (c === ':') { emit(c, i); emit(' '); continue }
      }
    }
    emit(c, i)
  }
  return out
}
