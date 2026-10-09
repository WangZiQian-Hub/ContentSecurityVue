import { describe, expect, it } from 'vitest'
import {
  scenarioDemoRecord,
  scenarioDemoRecordById,
  scenarioDemoRecords,
  scenarioDemoResult,
} from './scenario'
import { scenarioLabels, type Citation, type ScenarioCode } from '../types/scenario'

/* 演示数据同样要守文档的契约，否则演示时一核对就露馅：
   - 文档第 134 行：quote 必须是对应原文的连续片段
   - source_id 为 input 时指向请求正文，否则必须能在材料里找到
   - 场景风险等级是小写四档（与风险治理的大写等级不是同一套） */
const CODES = Object.keys(scenarioLabels) as ScenarioCode[]

/** 递归收集结果里出现的所有 Citation（顶层 evidence、Claim.evidence、时间轴项等）。 */
function collectCitations(value: unknown, found: Citation[] = []): Citation[] {
  if (Array.isArray(value)) {
    for (const item of value) collectCitations(item, found)
    return found
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.sourceId === 'string' && typeof record.quote === 'string') {
      found.push({ sourceId: record.sourceId, quote: record.quote })
      return found
    }
    for (const item of Object.values(record)) collectCitations(item, found)
  }
  return found
}

function sourcesOf(code: ScenarioCode) {
  const input = scenarioDemoRecord(code, `probe-${code}`).input as {
    content?: string
    materials?: { id: string; content: string }[]
  }
  const sources = new Map<string, string>()
  if (typeof input.content === 'string') sources.set('input', input.content)
  for (const material of input.materials ?? []) sources.set(material.id, material.content)
  return sources
}

describe('场景演示数据契约', () => {
  it('每条引用的 quote 都是对应来源里的连续片段', () => {
    for (const code of CODES) {
      const sources = sourcesOf(code)
      const citations = collectCitations(scenarioDemoResult(code))
      expect(citations.length, `${code} 没有任何引用`).toBeGreaterThan(0)
      for (const citation of citations) {
        const source = sources.get(citation.sourceId)
        expect(source, `${code}: source_id "${citation.sourceId}" 没有对应来源`).toBeDefined()
        expect(
          source!.includes(citation.quote),
          `${code}: 引用 "${citation.quote}" 不是 ${citation.sourceId} 的连续片段`,
        ).toBe(true)
      }
    }
  })

  it('每个场景都有正文，风险等级取小写四档之一', () => {
    for (const code of CODES) {
      const record = scenarioDemoRecord(code, `probe-${code}`)
      const content = (record.input as { content?: string }).content
      expect(typeof content === 'string' && content.length > 0, `${code} 缺少正文`).toBe(true)
      expect(['low', 'medium', 'high', 'unknown']).toContain(record.result!.riskLevel)
    }
  })

  it('按 ID 取回的记录保留原状态，失败记录不会被显示成成功', () => {
    const failed = scenarioDemoRecords('public_opinion').find((item) => item.status === 'failed')
    expect(failed, '演示记录里应当保留一条失败样本').toBeDefined()
    const reloaded = scenarioDemoRecordById(failed!.id)
    expect(reloaded.status).toBe('failed')
    expect(reloaded.result).toBeNull()
  })
})
