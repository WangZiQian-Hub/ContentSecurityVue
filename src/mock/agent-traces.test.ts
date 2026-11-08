import { describe, expect, it } from 'vitest'
import { createAgentTraceMock, parseTraceRecord, traceFormats } from './agent-traces'
import { mapKeys } from '../utils/case'
import { traceZip } from '../utils/agent-trace-export'
import type { AgentTraceApi, Command } from '../types/agent-traces'
async function finish(api: AgentTraceApi, command: Command) {
  const task = await api.execute(command, crypto.randomUUID())
  await api.task(task.taskId)
  await api.task(task.taskId)
  return api.task(task.taskId)
}
describe('agent trace contracts', () => {
  it('keeps batch totals independent of preview source and has the intended missing union', async () => {
    const api = createAgentTraceMock(),
      w = await api.workspace({})
    expect(w.summary.parsedTraceCount).toBe(200)
    expect(w.summary.byCategory.reduce((n, c) => n + c.count, 0)).toBe(200)
    expect(w.validation.metrics.map((m) => m.passed)).toEqual([200, 200, 192, 160])
    const time = await api.samples(w.batch!.batchId, {
        snapshotId: w.batch!.activeSnapshotId!,
        issueType: 'time_missing',
        pageSize: 100,
      }),
      usage = await api.samples(w.batch!.batchId, {
        snapshotId: w.batch!.activeSnapshotId!,
        issueType: 'usage_missing',
        pageSize: 100,
      })
    expect(new Set([...time.items, ...usage.items].map((r) => r.traceId)).size).toBe(44)
    const single = await api.workspace({ sourceId: 'mock_file_openai' })
    expect(single.samplePage.total).toBe(100)
    expect(single.summary.parsedTraceCount).toBe(200)
  })
  it('returns adjacent samples across pages and refuses mismatched source and snapshot', async () => {
    const api = createAgentTraceMock(),
      w = await api.workspace({})
    const q = { snapshotId: w.batch!.activeSnapshotId!, sourceId: 'mock_file_openai' }
    const d = await api.detail(w.batch!.batchId, 'mock_trace_20', q)
    expect(d.navigation.next?.traceId).toBe('mock_trace_21')
    expect(d.navigation.next?.page).toBe(2)
    await expect(api.detail(w.batch!.batchId, 'mock_trace_101', q)).rejects.toThrow('来源')
    await expect(api.samples(w.batch!.batchId, { snapshotId: 'wrong' })).rejects.toThrow('快照')
  })
  it('parses all three supported containers and protects arbitrary original keys', () => {
    for (const f of traceFormats) {
      const p = parseTraceRecord(JSON.parse(f.exampleText))
      expect(p.events.some((e) => e.eventType === 'tool_call')).toBe(true)
    }
    const payload = {
      raw_text: '{"tool_call_id":"original","User_Key":1}',
      input_json: '{"do_not_change":true}',
    }
    expect(mapKeys(payload, 'camel')).toEqual({
      rawText: payload.raw_text,
      inputJson: payload.input_json,
    })
    expect(() =>
      parseTraceRecord({
        messages: [
          {
            role: 'assistant',
            tool_calls: [{ id: 'x', function: { name: 't', arguments: 'bad json' } }],
          },
        ],
      }),
    ).toThrow()
  })
  it('preserves the old published snapshot while new files wait and publishes partial results', async () => {
    const api = createAgentTraceMock(),
      b = await api.createBatch('new', 'create')
    const good = traceFormats[0].exampleText.replaceAll('\n', '')
    const upload = await api.upload(new File([good + '\ninvalid'], 'partial.jsonl'), 'upload')
    const bound = await api.bind(
      b.batchId,
      1,
      [{ fileId: upload.fileId, formatOverride: 'auto' }],
      'bind',
    )
    expect((await api.workspace({ batchId: b.batchId })).summary.parsedTraceCount).toBe(0)
    const task = await finish(api, {
      capabilityCode: 'agent_trace_ingest',
      name: 'parse',
      input: {
        batchId: b.batchId,
        expectedVersion: bound.batch.batchVersion,
        fileIds: [upload.fileId],
      },
    })
    expect(task.status).toBe('succeeded')
    expect(task.result?.outcome).toBe('partial')
    const w = await api.workspace({ batchId: b.batchId })
    expect(w.summary.parsedTraceCount).toBe(1)
    expect(w.summary.failedRecordCount).toBe(1)
    expect(w.validation.metrics.find((m) => m.code === 'usage')?.passed).toBe(0)
  })
  it('uses stable idempotent responses and rejects same-key different payload', async () => {
    const api = createAgentTraceMock()
    expect((await api.createBatch('same', 'key')).batchId).toBe(
      (await api.createBatch('same', 'key')).batchId,
    )
    await expect(api.createBatch('other', 'key')).rejects.toThrow('幂等')
    const b = await api.createBatch('empty', 'new')
    await expect(api.bind(b.batchId, 20, [], 'bad')).rejects.toThrow('版本')
  })
  it('creates a real ZIP rather than renamed JSON', async () => {
    const zip = traceZip([{ name: 'manifest.json', text: '{"ok":true}' }])
    const bytes = new Uint8Array(await zip.arrayBuffer())
    expect([...bytes.slice(0, 4)]).toEqual([80, 75, 3, 4])
    expect(new DataView(bytes.buffer).getUint32(bytes.length - 22, true)).toBe(0x06054b50)
  })
})
