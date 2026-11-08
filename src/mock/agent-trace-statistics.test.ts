import { describe, expect, it } from 'vitest'
import { createAgentTraceMock } from './agent-traces'
import {
  aggregateStatistics,
  createAgentTraceStatisticsMock,
  projectStatistics,
} from './agent-trace-statistics'
import { mapKeys } from '../utils/case'
import type {
  AgentTraceStatisticsExport,
  AgentTraceStatisticsSource,
} from '../types/agent-trace-statistics'
import { mkdirSync, writeFileSync } from 'node:fs'
function fixture() {
  const ingest = createAgentTraceMock()
  const api = createAgentTraceStatisticsMock((q) => ingest.statisticsSource!(q))
  return { ingest, api }
}
describe('statistics snapshot contracts', () => {
  it('bounds UTF-8 previews and exports full JSON rather than a truncated prefix', async () => {
    const { ingest } = fixture(),
      source = ingest.statisticsSource!({})[0]
    const original = JSON.parse(source.rows[0].raw)
    original.User_ID = 'Case_Preserved'
    original.long_text = '中文🙂'.repeat(30000)
    const large = { ...source, rows: [{ ...source.rows[0], raw: JSON.stringify(original) }] }
    const api = createAgentTraceStatisticsMock(() => [large]),
      w = await api.statistics({}),
      q = w.scope!
    let d = await api.sample(q.batchId, large.rows[0].traceId, q)
    expect(d.sampleJson.complete).toBe(false)
    expect(d.sampleJson.loadedBytes).toBeLessThanOrEqual(262144)
    expect(d.rawPreview.truncated).toBe(true)
    let text = d.sampleJson.jsonText,
      cursor = d.sampleJson.nextCursor
    while (cursor) {
      d = await api.sample(q.batchId, large.rows[0].traceId, {
        ...q,
        representation: 'sample',
        contentCursor: cursor,
      })
      expect(d.contentChunk!.offsetBytes).toBe(new TextEncoder().encode(text).length)
      text += d.contentChunk!.text
      cursor = d.contentChunk!.nextCursor
    }
    expect(JSON.parse(text).source_record.long_text).toBe(original.long_text)
    expect(JSON.parse(text).source_record.User_ID).toBe('Case_Preserved')
    const command: AgentTraceStatisticsExport = {
      capabilityCode: 'agent_trace_export',
      name: 'full JSON',
      input: {
        ...q,
        view: 'statistics',
        exportKind: 'sample_json',
        format: 'json',
        scope: {
          type: 'sample',
          language: 'all',
          listFilter: 'all',
          traceIds: [large.rows[0].traceId],
        },
        contents: ['normalized_json'],
        redactionProfile: 'standard',
        anonymizeIds: false,
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
        uiVersion: 'statistics_v1',
      },
    }
    const task = await api.export(command, 'full')
    await api.task(task.taskId)
    expect((await api.task(task.taskId)).status).toBe('succeeded')
    const ticket = await api.ticket(task.taskId, 'file'),
      exported = await (await fetch(ticket.downloadUrl)).json()
    expect(exported.source_record.long_text).toBe(original.long_text)
    api.dispose?.()
    ingest.dispose?.()
  })
  it('aggregates the ingestion snapshot, independently of six visible records', async () => {
    const { ingest, api } = fixture(),
      w = await api.statistics({})
    expect(w.kpis.sampleCount.value).toBe(200)
    expect(w.kpis.riskSampleCount.value).toBe(128)
    expect(w.kpis.toolCallCount.value).toBe(1400)
    expect(w.kpis.averageSteps.value).toBe(18)
    expect(w.kpis.taskSuccessRate.value).toBe(86)
    expect(w.charts.testCategoryDistribution.items.reduce((n, r) => n + (r.count || 0), 0)).toBe(
      200,
    )
    expect(w.completeness.missingUnionCount).toBe(44)
    expect(w.charts.durationDistribution.validCount).toBe(192)
    expect(w.charts.durationDistribution.p95Ms).toBe(8600)
    expect(w.kpis.reasoningOutputRatio.denominator).toBe(160 * 790)
    const source = ingest.statisticsSource!({})[0],
      rows = projectStatistics(source, {})
    expect(w.kpis.recordedTokens.value).toBe(
      rows.reduce((n, r) => n + (r.tokenUsage.totalRecorded || 0), 0),
    )
    const zh = await api.statistics({ language: 'zh' })
    expect(zh.kpis.sampleCount.value).toBe(100)
    expect(zh.charts.languageDistribution.items.find((r) => r.code === 'zh')?.ratioPercent).toBe(
      100,
    )
    expect(zh.languageOptions.find((r) => r.code === 'en')?.count).toBe(100)
    const risk = await api.samples(w.scope!.batchId, { ...w.scope!, listFilter: 'risk', page: 1 })
    expect(risk.total).toBe(128)
    expect(risk.items.every((r) => r.auditDecision === 'risk_found')).toBe(true)
    const allIds = new Set<string>()
    for (let p = 1; p <= 34; p++) {
      const list = await api.samples(w.scope!.batchId, { ...w.scope!, page: p })
      list.items.forEach((r) => allIds.add(r.traceId))
    }
    expect(allIds.size).toBe(200)
    api.dispose?.()
    ingest.dispose?.()
  })
  it('has coherent cross-page details and opaque JSON keys', async () => {
    const { api, ingest } = fixture(),
      w = await api.statistics({}),
      q = { ...w.scope!, pageSize: 6 }
    const d = await api.sample(q.batchId, w.samplePage.items[5].traceId, q)
    expect(d.navigation.next?.page).toBe(2)
    const next = await api.sample(q.batchId, d.navigation.next!.traceId, q)
    expect(next.navigation.previous?.traceId).toBe(d.traceId)
    const json = JSON.parse(d.sampleJson.jsonText)
    expect(json.events).toHaveLength(d.summary.eventCount!)
    expect(
      json.events.filter((e: { event_type: string }) => e.event_type === 'tool_call'),
    ).toHaveLength(d.summary.callCount!)
    expect(d.sampleJson.jsonText).toContain('tool_call_id')
    const preserved = JSON.stringify({
      User_ID: 'sample',
      tool_call_id: 'CALL-01',
      Nested_Key: { A_B: '"x"' },
    })
    expect(mapKeys({ json_text: preserved }, 'camel')).toEqual({ jsonText: preserved })
    await expect(
      api.sample(q.batchId, 'mock_trace_200', { ...q, listFilter: 'risk' }),
    ).rejects.toThrow('409')
    await expect(api.samples(q.batchId, { ...q, projectionVersion: 'old' })).rejects.toThrow('410')
    if (process.env.GENERATE_STATISTICS_EXAMPLES === '1') {
      mkdirSync('docs/agent-trace-statistics-examples', { recursive: true })
      for (const [name, data] of Object.entries({
        S01: w,
        S02: await api.samples(q.batchId, { ...q, page: 2 }),
        S03: d,
      }))
        writeFileSync(
          `docs/agent-trace-statistics-examples/${name}.json`,
          JSON.stringify(
            {
              code: 0,
              message: 'ok',
              data: mapKeys(data, 'snake'),
              trace_id: 'example_request_trace',
              timestamp: '2026-11-07T00:00:00+08:00',
            },
            null,
            2,
          ),
        )
    }
    api.dispose?.()
    ingest.dispose?.()
  })
  it('handles empty language, zero denominator, missing fields and uninstrumented uploads', () => {
    const { ingest } = fixture(),
      source = ingest.statisticsSource!({})[0]
    const empty = aggregateStatistics(source, { language: 'unknown' })
    expect(empty.kpis.taskSuccessRate.value).toBeNull()
    expect(empty.charts.durationDistribution.p50Ms).toBeNull()
    const custom: AgentTraceStatisticsSource = {
      ...source,
      rows: [
        {
          ...source.rows[0],
          raw: JSON.stringify({
            usage: {
              input_tokens: 0,
              reasoning_tokens: 0,
              output_tokens: 0,
              output_excludes_reasoning: true,
            },
            metadata: { duration_ms: 0 },
          }),
        },
      ],
    }
    const w = aggregateStatistics(custom, {})
    expect(w.kpis.reasoningOutputRatio.value).toBeNull()
    expect(w.charts.durationDistribution.buckets[0].count).toBe(1)
    expect(w.completeness.reasoning.availableCount).toBe(1)
    expect(w.charts.behaviorMatrix.availability).toBe('unavailable')
    expect(w.charts.toolResultDistribution.unknownCount).toBe(7)
    custom.rows[0].raw = JSON.stringify({
      metadata: { duration_ms: -1 },
      usage: { reasoning_tokens: -3, output_tokens: 30 },
    })
    const invalid = aggregateStatistics(custom, {})
    expect(invalid.charts.durationDistribution.invalidCount).toBe(1)
    expect(invalid.charts.durationDistribution.missingCount).toBe(0)
    expect(invalid.completeness.reasoning.invalidCount).toBe(1)
    expect(invalid.completeness.missingUnionCount).toBe(1)
    expect(invalid.charts.tokenComposition.components[2].count).toBeNull()
    ingest.dispose?.()
  })
  it('exports a real ZIP with all filtered samples, hashes and idempotency', async () => {
    const { api, ingest } = fixture(),
      w = await api.statistics({ language: 'zh' })
    const command: AgentTraceStatisticsExport = {
      capabilityCode: 'agent_trace_export',
      name: 'test',
      input: {
        ...w.scope!,
        view: 'statistics',
        exportKind: 'package',
        format: 'zip',
        scope: { type: 'filtered', language: 'zh', listFilter: 'all', traceIds: [] },
        contents: ['stats_summary', 'sample_table', 'normalized_json', 'manifest'],
        redactionProfile: 'standard',
        anonymizeIds: true,
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
        uiVersion: 'statistics_v1',
      },
    }
    const t = await api.export(command, 'key')
    expect((await api.export(command, 'key')).taskId).toBe(t.taskId)
    await expect(api.export({ ...command, name: 'different' }, 'key')).rejects.toThrow('409')
    await api.task(t.taskId)
    const done = await api.task(t.taskId)
    expect(done.status).toBe('succeeded')
    const ticket = await api.ticket(t.taskId, 'ticket'),
      bytes = new Uint8Array(await (await fetch(ticket.downloadUrl)).arrayBuffer())
    const view = new DataView(bytes.buffer),
      files = new Map<string, string>()
    let pos = 0
    while (view.getUint32(pos, true) === 0x04034b50) {
      const size = view.getUint32(pos + 18, true),
        len = view.getUint16(pos + 26, true),
        extra = view.getUint16(pos + 28, true),
        start = pos + 30 + len + extra
      files.set(
        new TextDecoder().decode(bytes.slice(pos + 30, pos + 30 + len)),
        new TextDecoder().decode(bytes.slice(start, start + size)),
      )
      pos = start + size
    }
    expect(files.size).toBe(103)
    const manifest = JSON.parse(files.get('manifest.json')!)
    expect(manifest.sample_count).toBe(100)
    expect(manifest.aggregate_scope.sample_count).toBe(100)
    expect(manifest.files.every((f: { sha256: string }) => /^[0-9a-f]{64}$/.test(f.sha256))).toBe(
      true,
    )
    expect(JSON.parse(files.get('sample_table.json')!)[0].traceId).toMatch(/^sample_/)
    api.dispose?.()
    ingest.dispose?.()
  })
})
