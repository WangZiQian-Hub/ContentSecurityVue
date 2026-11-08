import type { AgentTraceStatisticsSource as Source } from '../types/agent-trace-statistics'
import type { Event } from '../types/agent-traces'
/** Dedicated statistics demo, isolated from ingestion and production HTTP data. */
export function statisticsReference(source: Source): Source {
  if (source.batch.batchId !== 'mock_batch_demo' || source.rows.length !== 200) return source
  const s = structuredClone(source),
    codes = [
      'prompt_injection',
      'unauthorized_access',
      'privacy_leak',
      'harmful_content',
      'tool_misuse',
      'other',
    ]
  const first = [
    [980, 1520, 640, 16, 6, 0, 7100],
    [860, 1080, 720, 12, 5, 1, 5900],
    [1100, 1340, 620, 15, 6, 0, 6800],
    [1200, 1250, 790, 18, 7, 1, 8600],
    [980, 980, 560, 14, 5, 0, 4900],
    [1050, 1200, 680, 13, 4, 1, 6200],
  ]
  const spread = (total: number, n: number) =>
    Array.from({ length: n }, (_, i) => Math.floor(total / n) + (i < total % n ? 1 : 0))
  const values = (col: number, total: number, n = 200) => [
    ...first.map((r) => r[col]),
    ...spread(total - first.reduce((v, r) => v + r[col], 0), n - 6),
  ]
  const input = values(0, 110000),
    reasoning = [...values(1, 84860, 160), ...Array(40).fill(null)],
    output = [...values(2, 53600, 160), ...spread(140, 40)],
    steps = values(3, 2840),
    calls = values(4, 486)
  const cats = [2, 1, 3, 0, 4, 5],
    counts = [40, 36, 32, 28, 34, 30]
  cats.forEach((i) => counts[i]--)
  cats.push(...counts.flatMap((n, i) => Array(n).fill(i)))
  const durations = [
    ...Array(12).fill(700),
    ...Array(34).fill(1500),
    ...Array(52).fill(3200),
    ...Array(40).fill(4900),
    ...Array(28).fill(7100),
    ...Array(18).fill(8700),
    ...Array(8).fill(11000),
  ]
  first.forEach((r) => {
    const v = r[6] <= 6000 ? 4900 : r[6] <= 8000 ? 7100 : 8700
    durations.splice(durations.indexOf(v), 1)
  })
  const times = [...first.map((r) => r[6]), ...durations, ...Array(8).fill(null)]
  const tools = [148, 132, 86, 40, 20, 20, 20, 20].flatMap((n, i) =>
    Array(n).fill(
      ['search', 'fetch', 'query', 'export', 'read', 'write', 'calculate', 'inspect'][i],
    ),
  )
  let attempt = 0
  s.rows = [...s.rows.slice(38, 44), ...s.rows.filter((_, i) => i < 38 || i >= 44)].map((r, i) => {
    const events: Event[] = [
        { eventId: 'STEP-01', ordinal: 1, eventType: 'user_input', label: '用户输入' },
      ],
      outcomes = []
    for (let c = 0; c < calls[i]; c++) {
      const tool = tools[attempt],
        status = attempt < 402 ? 'succeeded' : attempt < 460 ? 'failed' : 'blocked',
        callId = `CALL-${c + 1}`
      attempt++
      outcomes.push({ call_id: callId, status, attempt_index: i < 6 && c < first[i][5] ? 2 : 1 })
      for (const eventType of ['tool_call', 'tool_result'])
        events.push({
          eventId: `STEP-${events.length + 1}`,
          ordinal: events.length + 1,
          eventType,
          label: tool,
          toolName: tool,
          callId,
          inputJson: '{"User_ID":"demo"}',
          outputJson: '"已脱敏结果"',
        })
    }
    while (events.length < steps[i])
      events.push({
        eventId: `STEP-${events.length + 1}`,
        ordinal: events.length + 1,
        eventType: 'model_response',
        label: '已记录响应',
      })
    const raw = {
      messages: events.map((e) => ({
        role: e.eventType === 'tool_result' ? 'tool' : 'assistant',
        content: e.label,
        tool_call_id: e.callId,
      })),
      usage: {
        input_tokens: input[i],
        ...(reasoning[i] === null ? {} : { reasoning_tokens: reasoning[i] }),
        output_tokens: output[i],
        output_excludes_reasoning: true,
      },
      metadata: times[i] === null ? {} : { duration_ms: times[i] },
      task_status:
        i === 2
          ? 'blocked'
          : i === 3
            ? 'terminated'
            : i < 174
              ? 'completed'
              : i < 187
                ? 'blocked'
                : 'terminated',
      audit: { decision: i < 128 ? 'risk_found' : 'no_risk_found' },
      entry_source: i < 80 ? 'platform' : i < 150 ? 'scenario' : 'external_import',
      tool_outcomes: outcomes,
      behavior_events: [],
    }
    return {
      ...r,
      language: i < 3 ? 'zh' : i < 6 ? 'en' : i % 2 === 0 ? 'zh' : 'en',
      testCategory: codes[cats[i]],
      events,
      eventCount: events.length,
      callCount: calls[i],
      raw: JSON.stringify(raw, null, 2),
      paths: events.map((_, j) => `messages[${j}]`),
    }
  })
  const matrix = [
      [18, 6, 4, 7, 12],
      [24, 5, 3, 6, 10],
      [12, 8, 5, 4, 9],
      [10, 4, 3, 5, 6],
      [20, 7, 6, 9, 11],
      [8, 3, 2, 4, 7],
    ],
    behaviors = ['unauthorized', 'argument_error', 'timeout', 'duplicate', 'retry']
  codes.forEach((code, i) => {
    const rows = s.rows.filter((r) => r.testCategory === code)
    matrix[i].forEach((n, col) => {
      for (let j = 0; j < n; j++) {
        const r = rows[j % rows.length],
          raw = JSON.parse(r.raw)
        raw.behavior_events.push({
          event_id: r.events[Math.floor(j / rows.length)].eventId,
          behavior_code: behaviors[col],
        })
        r.raw = JSON.stringify(raw, null, 2)
      }
    })
  })
  return s
}
