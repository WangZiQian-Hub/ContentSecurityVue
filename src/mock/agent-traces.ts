import type {
  AgentTraceApi,
  Batch,
  Command,
  Detail,
  Event,
  FileRow,
  Format,
  Query,
  Sample,
  TraceTask,
  Workspace,
} from '../types/agent-traces'
import type { PageResult } from '../types'
import { tracePng, traceZip } from '../utils/agent-trace-export'
const labels = ['提示注入', '越权访问', '隐私泄露', '有害内容', '工具滥用', '其他']
const codes = [
  'prompt_injection',
  'unauthorized_access',
  'privacy_leak',
  'harmful_content',
  'tool_misuse',
  'other',
]
const openai = {
  messages: [
    { role: 'user', content: 'Public report summary.' },
    {
      role: 'assistant',
      tool_calls: [
        {
          id: 'CALL-01',
          type: 'function',
          function: { name: 'web.search', arguments: '{"q":"public report"}' },
        },
      ],
    },
    { role: 'tool', tool_call_id: 'CALL-01', content: 'Public page result' },
  ],
}
export const traceFormats: Format[] = [
  {
    code: 'openai_messages',
    label: 'OpenAI Messages',
    containers: ['JSON', 'JSONL'],
    description: 'OpenAI 聊天轨迹，包含消息与工具调用结构',
    availability: 'available',
    schemaVersion: '1',
    exampleText: JSON.stringify(openai, null, 2),
  },
  {
    code: 'langchain_trace',
    label: 'LangChain / LangSmith Trace',
    containers: ['JSON', 'JSONL'],
    description: '运行节点、父子关系及工具调用记录',
    availability: 'available',
    schemaVersion: '1',
    exampleText: JSON.stringify(
      {
        runs: [
          {
            id: 'root',
            parent_run_id: null,
            run_type: 'chain',
            name: 'report',
            inputs: { q: 'report' },
            outputs: { text: 'summary' },
          },
          {
            id: 'tool',
            parent_run_id: 'root',
            run_type: 'tool',
            name: 'web.search',
            inputs: { q: 'report' },
            outputs: { text: 'public page' },
          },
        ],
      },
      null,
      2,
    ),
  },
  {
    code: 'agent_trajectory',
    label: '智能体轨迹 JSONL',
    containers: ['JSON', 'JSONL'],
    description: '外部智能体 events / tool_events 轨迹（含推理、工具及 Token）',
    availability: 'available',
    schemaVersion: '1',
    exampleText: JSON.stringify({
      sample_id: 'AGT-001', language: 'zh', duration_ms: 1200,
      tokens: { input: 100, reasoning: 20, output: 30, total: 150, estimated: false },
      outcome: 'success',
      events: [
        { idx: 0, step_id: 'STEP-00', type: 'user', content: '查询公开报告', ts_ms: 0 },
        { idx: 1, step_id: 'STEP-01', type: 'tool_call', tool: 'fetch_page', tool_args: { url: 'https://example.com/report' }, ts_ms: 100 },
        { idx: 2, step_id: 'STEP-01', type: 'tool_result', tool: 'fetch_page', tool_status: 'success', content: '公开报告正文', latency_ms: 100, ts_ms: 100 },
        { idx: 3, step_id: 'STEP-02', type: 'final', content: '报告摘要', ts_ms: 1200 },
      ], tool_events: [{ step_id: 'STEP-01', tool: 'fetch_page', status: 'success', latency_ms: 100 }],
    }, null, 2),
  },
]
const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const text = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v ?? null))
export function parseTraceRecord(
  value: unknown,
  override = 'auto',
): { format: string; events: Event[]; paths: string[]; time: boolean; usage: boolean } {
  const root = record(value),
    messages = arr(root.messages),
    runs = arr(root.runs)
  if (root.sample_id && Array.isArray(root.events)) {
    if (override !== 'auto' && override !== 'agent_trajectory') throw new Error('格式不匹配')
    const rows = root.events.map(record)
    if (!rows.length || rows.some(e => typeof e.idx !== 'number') || new Set(rows.map(e => e.idx)).size !== rows.length)
      throw new Error('events 缺失或 idx 不合法')
    const events: Event[] = rows.map((e, i) => ({
      eventId: `STEP-${String(i + 1).padStart(2, '0')}`, ordinal: i + 1,
      eventType: String(e.type), label: String(e.tool || e.type),
      toolName: e.tool ? String(e.tool) : null,
      callId: ['tool_call', 'tool_result'].includes(String(e.type)) ? JSON.stringify([e.step_id, e.tool]) : null,
      inputJson: e.type === 'tool_call' ? text(e.tool_args) : null,
      outputJson: e.type === 'tool_result' ? text(e.content) : null,
      durationMs: typeof e.latency_ms === 'number' ? e.latency_ms : null,
    }))
    return { format: 'agent_trajectory', events, paths: rows.map((_, i) => `events[${i}]`),
      time: typeof root.duration_ms === 'number' && root.duration_ms >= 0,
      usage: typeof record(root.tokens).input === 'number' && typeof record(root.tokens).output === 'number' }
  }
  if (messages.some(m => arr(record(m).content).some(c => ['tool_use', 'tool_result'].includes(String(record(c).type)))))
    throw new Error('不再支持 Anthropic 格式')
  const format = runs.length ? 'langchain_trace' : messages.length ? 'openai_messages' : ''
  if (!format || (override !== 'auto' && override !== format))
    throw new Error('结构无法识别或与手动指定格式不匹配')
  const events: Event[] = [],
    paths: string[] = []
  function add(event: Omit<Event, 'eventId' | 'ordinal' | 'label'>, path: string) {
    const ordinal = events.length + 1
    events.push({
      ...event,
      eventId: `STEP-${String(ordinal).padStart(2, '0')}`,
      ordinal,
      label: event.toolName || event.eventType,
    })
    paths.push(path)
  }
  if (format === 'langchain_trace')
    runs.forEach((r, i) => {
      const run = record(r)
      if (!run.id || !run.run_type) throw new Error('运行节点缺少 id 或 run_type')
      add(
        {
          eventType: run.run_type === 'tool' ? 'tool_call' : 'model_response',
          toolName: String(run.name || ''),
          callId: String(run.id),
          inputJson: text(run.inputs),
          outputJson: text(run.outputs),
        },
        `runs[${i}]`,
      )
    })
  else
    messages.forEach((m, i) => {
      const msg = record(m)
      if (!['user', 'assistant', 'tool', 'system'].includes(String(msg.role)))
        throw new Error('消息 role 不合法')
      const calls = arr(msg.tool_calls)
      if (calls.length)
        calls.forEach((c, j) => {
          const call = record(c),
            fn = record(call.function)
          if (!call.id || !fn.name) throw new Error('工具调用缺少 id 或 name')
          const input = text(fn.arguments)
          JSON.parse(input)
          add(
            {
              eventType: 'tool_call',
              role: String(msg.role),
              toolName: String(fn.name),
              callId: String(call.id),
              inputJson: input,
            },
            `messages[${i}].tool_calls[${j}]`,
          )
        })

      else
        add(
          {
            eventType:
              msg.role === 'tool'
                ? 'tool_result'
                : msg.role === 'user'
                  ? 'user_input'
                  : 'model_response',
            role: String(msg.role),
            callId: msg.tool_call_id ? String(msg.tool_call_id) : null,
            outputJson: text(msg.content),
          },
          `messages[${i}]`,
        )
    })
  const metadata = record(root.metadata),
    usage = record(root.usage)
  return {
    format,
    events,
    paths,
    time: typeof metadata.duration_ms === 'number' && metadata.duration_ms >= 0,
    usage:
      typeof usage.input_tokens === 'number' &&
      usage.input_tokens >= 0 &&
      typeof usage.output_tokens === 'number' &&
      usage.output_tokens >= 0,
  }
}
interface Stored extends Sample {
  raw: string
  events: Event[]
  paths: string[]
  time: boolean
  usage: boolean
  linked: boolean
}
interface State {
  batch: Batch
  files: FileRow[]
  rows: Stored[]
  snapshots: Map<string, Stored[]>
}
function sampleSummary(r: Sample): Sample {
  return {
    traceId: r.traceId,
    displayId: r.displayId,
    sourceId: r.sourceId,
    filename: r.filename,
    sourceFormat: r.sourceFormat,
    language: r.language,
    testCategory: r.testCategory,
    eventCount: r.eventCount,
    callCount: r.callCount,
    issueTypes: r.issueTypes,
  }
}
function page<T>(rows: T[], p = 1, size = 20): PageResult<T> {
  return {
    items: rows.slice((p - 1) * size, p * size),
    total: rows.length,
    page: p,
    pageSize: size,
    totalPages: Math.ceil(rows.length / size),
  }
}
export function createAgentTraceMock(): AgentTraceApi {
  const batches: State[] = [],
    uploads = new Map<string, { name: string; size: number; content: string }>(),
    jobs = new Map<string, { task: TraceTask; polls: number; run: () => Promise<void> }>(),
    artifacts = new Map<string, { blob: Blob; filename: string }>(),
    memo = new Map<string, { payload: string; promise: Promise<unknown> }>(),
    urls: string[] = []
  const permissions = ['upload', 'bind_files', 'parse', 'view_raw', 'export_view', 'export_package']
  const makeBatch = (name: string, id = `mock_batch_${crypto.randomUUID()}`): State => ({
    batch: {
      batchId: id,
      displayId: id === 'mock_batch_demo' ? 'AUD-2026-001' : `AUD-${batches.length + 1}`,
      name,
      batchVersion: 1,
      activeSnapshotId: null,
      allowedActions: permissions,
      stagingChanged: false,
    },
    files: [],
    rows: [],
    snapshots: new Map(),
  })
  const initial = makeBatch('轨迹审计示例', 'mock_batch_demo')
  batches.push(initial)
  const missingTime = new Set([1, 2, 81, 117, 150, 180, 181, 182]),
    missingUsage = new Set([...Array.from({ length: 36 }, (_, i) => i + 1), 49, 76, 81, 117])
  for (let n = 1; n <= 200; n++) {
    const format = n <= 100 ? 'openai_messages' : 'langchain_trace',
      raw = traceFormats.find((f) => f.code === format)!.exampleText,
      parsed = parseTraceRecord(JSON.parse(raw))
    // Full deterministic 18-event fixture, including seven calls and their returns.
    const events: Event[] = [
      { eventId: 'STEP-01', ordinal: 1, eventType: 'user_input', label: '用户输入' },
      { eventId: 'STEP-02', ordinal: 2, eventType: 'model_response', label: '模型响应' },
    ]
    for (let c = 1; c <= 7; c++) {
      for (const type of ['tool_call', 'tool_result']) {
        const ordinal = events.length + 1
        events.push({
          eventId: `STEP-${String(ordinal).padStart(2, '0')}`,
          ordinal,
          eventType: type,
          label: type === 'tool_call' ? '搜索调用' : '工具返回',
          toolName: 'web.search',
          callId: `CALL-${String(c).padStart(2, '0')}`,
          inputJson: '{"q":"public report"}',
          outputJson: type === 'tool_result' ? '"Public page result"' : null,
        })
      }
    }
    events.push(
      { eventId: 'STEP-17', ordinal: 17, eventType: 'model_response', label: '汇总结果' },
      { eventId: 'STEP-18', ordinal: 18, eventType: 'model_response', label: '任务完成' },
    )
    let pos = 0,
      category = 5
    for (const [i, count] of [40, 36, 32, 28, 34, 30].entries()) {
      pos += count
      if (n <= pos) {
        category = i
        break
      }
    }
    const issueTypes = [
      ...(missingTime.has(n) ? ['time_missing'] : []),
      ...(missingUsage.has(n) ? ['usage_missing'] : []),
    ]
    initial.rows.push({
      traceId: `mock_trace_${n}`,
      displayId: `AUD-${String(n).padStart(4, '0')}`,
      sourceId: n <= 100 ? 'mock_file_openai' : 'mock_file_langchain',
      filename: n <= 100 ? 'openai_messages_demo.jsonl' : 'langchain_trace_demo.jsonl',
      sourceFormat: format,
      language: n % 2 === 0 ? 'en' : 'zh',
      testCategory: codes[category],
      eventCount: 18,
      callCount: 7,
      issueTypes,
      raw,
      events,
      paths: events.map((_, i) =>
        i === 2
          ? parsed.paths.find((p) => p.includes('tool_calls')) || 'runs[1]'
          : format === 'openai_messages'
            ? 'messages[0]'
            : 'runs[0]',
      ),
      time: !missingTime.has(n),
      usage: !missingUsage.has(n),
      linked: true,
    })
  }
  // Expand fixture evidence to match all 18 events rather than inventing source locations.
  for (const row of initial.rows) {
    if (row.sourceFormat === 'openai_messages') {
      const messages: unknown[] = [
        { role: 'user', content: 'Public report summary.' },
        { role: 'assistant', content: 'Searching public reports' },
      ]
      for (let c = 1; c <= 7; c++) {
        messages.push(
          {
            role: 'assistant',
            tool_calls: [
              {
                id: `CALL-${String(c).padStart(2, '0')}`,
                type: 'function',
                function: { name: 'web.search', arguments: '{"q":"public report"}' },
              },
            ],
          },
          {
            role: 'tool',
            tool_call_id: `CALL-${String(c).padStart(2, '0')}`,
            content: 'Public page result',
          },
        )
      }
      messages.push(
        { role: 'assistant', content: 'Report summary' },
        { role: 'assistant', content: 'Completed' },
      )
      row.raw = JSON.stringify({ messages }, null, 2)
      row.paths = row.events.map(
        (e, i) => `messages[${i}]${e.eventType === 'tool_call' ? '.tool_calls[0]' : ''}`,
      )
    } else {
      row.raw = JSON.stringify(
        {
          runs: row.events.map((e, i) => ({
            id: e.callId ? `${e.callId}_${e.eventType}` : `run_${i}`,
            parent_run_id: i ? 'run_0' : null,
            run_type: e.eventType === 'tool_call' ? 'tool' : 'chain',
            name: e.toolName || e.label,
            inputs: { q: 'public report' },
            outputs: { text: e.label },
          })),
        },
        null,
        2,
      )
      row.paths = row.events.map((_, i) => `runs[${i}]`)
    }
  }
  initial.batch.activeSnapshotId = 'mock_snapshot_1'
  for (const row of initial.rows) {
    const raw = JSON.parse(row.raw)
    if (row.time) raw.metadata = { duration_ms: 8600 }
    if (row.usage)
      raw.usage = {
        input_tokens: 1200,
        output_tokens: 790,
        reasoning_tokens: 400,
        output_excludes_reasoning: true,
      }
    const ordinal = initial.rows.indexOf(row)
    raw.audit = {
      decision: ordinal < 128 ? 'risk_found' : 'no_risk_found',
      risk_types: ordinal < 128 ? [row.testCategory] : [],
      evidence_refs: [],
    }
    raw.task_status = ordinal < 172 ? 'completed' : ordinal < 186 ? 'blocked' : 'terminated'
    raw.entry_source = ordinal < 80 ? 'platform' : ordinal < 150 ? 'scenario' : 'external_import'
    raw.behavior_events = [
      {
        event_id: 'STEP-03',
        behavior_code: ['unauthorized', 'argument_error', 'timeout', 'duplicate', 'retry'][
          ordinal % 5
        ],
      },
    ]
    raw.tool_outcomes = row.events
      .filter((e) => e.eventType === 'tool_call')
      .map((e, i) => ({
        call_id: e.callId,
        attempt_index: ordinal % 5 === 4 && i === 6 ? 2 : 1,
        parent_call_id: ordinal % 5 === 4 && i === 6 ? 'CALL-01' : null,
        status:
          (ordinal * 7 + i) % 100 < 83
            ? 'succeeded'
            : (ordinal * 7 + i) % 100 < 95
              ? 'failed'
              : 'blocked',
      }))
    row.raw = JSON.stringify(raw, null, 2)
  }
  initial.snapshots.set('mock_snapshot_1', structuredClone(initial.rows))
  for (const sourceId of ['mock_file_openai', 'mock_file_langchain']) {
    const rows = initial.rows.filter((r) => r.sourceId === sourceId)
    initial.files.push({
      fileId: sourceId,
      filename: rows[0].filename,
      sizeBytes: 10000,
      detectedFormat: rows[0].sourceFormat,
      formatOverride: 'auto',
      recognitionState: 'recognized',
      parseStatus: 'succeeded',
      parsedTraceCount: 100,
      inputCandidateCount: 100,
      failedRecordCount: 0,
      errorExamples: [],
    })
  }
  const state = (id?: string) => {
    const s = id ? batches.find((b) => b.batch.batchId === id) : batches[batches.length - 1]
    if (!s) throw new Error('未找到批次')
    return s
  }
  const rowsFor = (s: State, q: Query) => {
    if (!q.snapshotId) return s.rows
    const rows = s.snapshots.get(q.snapshotId)
    if (!rows) throw new Error('快照不存在或已过期')
    return rows
  }
  const filter = (rows: Stored[], q: Query) =>
    rows.filter(
      (r) =>
        (!q.sourceId || r.sourceId === q.sourceId) &&
        (!q.issueType || r.issueTypes.includes(q.issueType)) &&
        (!q.q || r.displayId.toLowerCase().includes(q.q.toLowerCase())),
    )
  function once<T>(key: string, payload: unknown, fn: () => Promise<T>): Promise<T> {
    const serialized = JSON.stringify(payload),
      hit = memo.get(key)
    if (hit) {
      if (hit.payload !== serialized) return Promise.reject(new Error('幂等键载荷冲突'))
      return hit.promise as Promise<T>
    }
    const promise = fn()
    memo.set(key, { payload: serialized, promise })
    return promise
  }
  const api: AgentTraceApi = {
    statisticsSource(q) {
      const selected = q.batchId ? [state(q.batchId)] : batches
      return structuredClone(
        selected.map((s) => ({
          batch: s.batch,
          rows: rowsFor(s, {
            ...q,
            snapshotId: q.snapshotId || s.batch.activeSnapshotId || undefined,
          }),
        })),
      )
    },
    async workspace(q) {
      const s = q.batchId
          ? state(q.batchId)
          : q.sourceId
            ? batches.find((b) => b.files.some((f) => f.fileId === q.sourceId)) || state('missing')
            : state(),
        rows = rowsFor(s, q)
      if (q.sourceId && !s.files.some((f) => f.fileId === q.sourceId))
        throw new Error('来源与批次不匹配')
      const sourceId = q.sourceId || (q.issueType ? undefined : s.files[0]?.fileId),
        filtered = filter(rows, { ...q, sourceId }),
        selected = q.traceId
          ? filtered.find((r) => r.traceId === q.traceId)
          : filtered.find((r) => r.displayId === 'AUD-0042') || filtered[0]
      if (q.traceId && !selected) throw new Error('指定样本不属于当前筛选')
      const samplePage = page(
        filtered.map(sampleSummary),
        q.traceId ? Math.floor(filtered.indexOf(selected!) / 20) + 1 : q.page || 1,
        20,
      )
      const issues = ['time_missing', 'usage_missing', 'call_unlinked']
        .map((code) => ({
          code,
          severity: 'advisory',
          affectedTraceCount: rows.filter((r) => r.issueTypes.includes(code)).length,
          impact:
            code === 'time_missing'
              ? '影响耗时统计'
              : code === 'usage_missing'
                ? '不计入平均 Token'
                : '调用关联不完整',
          examples: rows
            .filter((r) => r.issueTypes.includes(code))
            .slice(0, 3)
            .map((r) => ({ traceId: r.traceId, displayId: r.displayId, sourceId: r.sourceId })),
        }))
        .filter((i) => i.affectedTraceCount)
      const metrics = ['structure', 'call_link', 'time', 'usage'].map((code) => {
        const eligible = code === 'call_link' ? rows.filter((r) => r.callCount > 0) : rows
        const passed = eligible.filter(
          (r) =>
            code === 'structure' ||
            (code === 'call_link' && r.linked) ||
            (code === 'time' && r.time) ||
            (code === 'usage' && r.usage),
        ).length
        return {
          code,
          passed,
          eligible: eligible.length,
          missing: code === 'time' || code === 'usage' ? eligible.length - passed : 0,
          failed: code === 'call_link' ? eligible.length - passed : 0,
          notApplicable: rows.length - eligible.length,
          state: !eligible.length
            ? 'not_applicable'
            : passed === eligible.length
              ? 'verified'
              : 'missing',
        }
      })
      const summary = {
        fileCount: new Set(rows.map((r) => r.sourceId)).size,
        supportedFormatCount: 3,
        importedFormatCount: new Set(rows.map((r) => r.sourceFormat)).size,
        parsedTraceCount: rows.length,
        failedRecordCount: s.files.reduce((n, f) => n + f.failedRecordCount, 0),
        categoryMode: 'single',
        byLanguage: ['zh', 'en', 'unknown'].map((code) => ({
          code,
          count: rows.filter((r) => r.language === code).length,
        })),
        byCategory: codes.map((code, i) => ({
          code,
          label: labels[i],
          count: rows.filter((r) => r.testCategory === code).length,
        })),
        byFormat: traceFormats.map((f) => ({
          code: f.code,
          traceCount: rows.filter((r) => r.sourceFormat === f.code).length,
        })),
      }
      return structuredClone({
        resolvedSelection: {
          batchId: s.batch.batchId,
          snapshotId: q.snapshotId || s.batch.activeSnapshotId,
          sourceId: sourceId || null,
          traceId: selected?.traceId || null,
        },
        formats: traceFormats,
        uploadPolicy: {
          allowedExtensions: ['.json', '.jsonl'],
          maxFileBytes: 5 * 1024 * 1024,
          maxFilesPerRequest: 10,
        },
        sourceOptions: page(
          [
            ...new Map(
              batches
                .flatMap((b) => b.files)
                .filter((f) => !q.optionQ || f.filename.includes(q.optionQ))
                .map((f) => [f.fileId, { sourceId: f.fileId, filename: f.filename }]),
            ).values(),
          ],
          q.optionPage || 1,
          50,
        ),
        batchOptions: page(
          batches
            .filter((b) => !q.sourceId || b.files.some((f) => f.fileId === q.sourceId))
            .map((b) => b.batch),
          q.batchOptionPage || 1,
          50,
        ),
        batch: s.batch,
        files: page(s.files, q.filesPage || 1, 20),
        summary,
        validation: {
          traceTotal: rows.length,
          metrics,
          canContinue: rows.length > 0,
          blockers: rows.length ? [] : ['尚无有效解析快照'],
        },
        issues,
        samplePage,
        exportOptions: {
          scopes: ['batch', 'filtered', 'sample'],
          anonymizeRequired: true,
          contents: [
            'normalized_json',
            'offline_html',
            'evidence_index',
            'manifest',
            'error_report',
          ].map((code) => ({ code, availability: 'available' })),
        },
        activeTasks: [...jobs.values()]
          .map((j) => j.task)
          .filter(
            (t) =>
              t.result?.batchId === s.batch.batchId &&
              (t.status === 'pending' || t.status === 'running'),
          ),
      }) as Workspace
    },
    createBatch: (name, key) =>
      once(key, { name }, async () => {
        if (!name.trim() || name.trim().length > 100) throw new Error('批次名称须为 1—100 字')
        const s = makeBatch(name.trim())
        batches.push(s)
        return structuredClone(s.batch)
      }),
    upload: (file, key) =>
      once(key, { name: file.name, size: file.size }, async () => {
        const fileId = `mock_file_${crypto.randomUUID()}`
        uploads.set(fileId, { name: file.name, size: file.size, content: await file.text() })
        return { fileId }
      }),
    bind: (batchId, version, files, key) =>
      once(key, { batchId, version, files }, async () => {
        const s = state(batchId)
        if (s.batch.batchVersion !== version) throw new Error('批次版本冲突，请刷新后重试')
        if (
          [...jobs.values()].some(
            (j) => j.task.status === 'running' && j.task.result?.batchId === batchId,
          )
        )
          throw new Error('正在解析，请稍后修改')
        for (const f of files)
          if (!uploads.has(f.fileId) && !s.files.some((row) => row.fileId === f.fileId))
            throw new Error('文件不存在')
        let changed = false
        for (const f of files) {
          let row = s.files.find((r) => r.fileId === f.fileId)
          if (!row) {
            const u = uploads.get(f.fileId)!
            row = {
              fileId: f.fileId,
              filename: u.name,
              sizeBytes: u.size,
              detectedFormat: null,
              formatOverride: f.formatOverride,
              recognitionState: 'pending',
              parseStatus: 'pending',
              parsedTraceCount: 0,
              inputCandidateCount: null,
              failedRecordCount: 0,
              errorExamples: [],
            }
            s.files.push(row)
            changed = true
          } else if (row.formatOverride !== f.formatOverride) {
            row.formatOverride = f.formatOverride
            row.parseStatus = 'pending'
            changed = true
          }
        }
        if (changed) {
          s.batch.batchVersion++
          s.batch.stagingChanged = true
        }
        return { batch: structuredClone(s.batch) }
      }),
    async samples(batchId, q) {
      return structuredClone(
        page(
          filter(rowsFor(state(batchId), q), q).map(sampleSummary),
          q.page || 1,
          q.pageSize || 20,
        ),
      )
    },
    async detail(batchId, traceId, q) {
      const s = state(batchId),
        all = rowsFor(s, q),
        row = all.find((r) => r.traceId === traceId)
      if (!row) throw new Error('样本不存在')
      if (q.sourceId && q.sourceId !== row.sourceId) throw new Error('样本与来源不匹配')
      const filtered = filter(all, q),
        idx = filtered.indexOf(row)
      if (idx < 0) throw new Error('样本不在当前筛选范围')
      const events = row.events.filter(
          (e) => !q.eventTypes || q.eventTypes.split(',').includes(e.eventType),
        ),
        event = q.eventId
          ? events.find((e) => e.eventId === q.eventId)
          : events.find((e) => e.eventType === 'tool_call') || events[0]
      if (q.eventId && !event) throw new Error('事件不存在或不属于筛选')
      const path = row.paths[event ? row.events.indexOf(event) : -1] || '$'
      const locator = (i: number) =>
        filtered[i]
          ? {
              traceId: filtered[i].traceId,
              sourceId: filtered[i].sourceId,
              page: Math.floor(i / 20) + 1,
            }
          : null
      return structuredClone({
        ...row,
        batchId,
        snapshotId: q.snapshotId || s.batch.activeSnapshotId!,
        selectedEventId: event?.eventId || null,
        selectedEventPage: event ? Math.floor(events.indexOf(event) / 50) + 1 : undefined,
        eventOptions: events.map(({ eventId, ordinal, eventType, label, toolName }) => ({ eventId, ordinal, eventType, label, toolName })),
        rawPreview: {
          rawText: row.raw.slice(0, 65536),
          kind: 'full',
          truncated: row.raw.length > 65536,
          lineStart: 1,
          totalLines: row.raw.split('\n').length,
        },
        events: page(events, q.eventId && event ? Math.floor(events.indexOf(event) / 50) + 1 : q.eventPage || 1, 50),
        normalizedEvent: event || null,
        sourceRef: { sourcePath: path, recordIndex: all.indexOf(row) + 1 },
        mapping: {
          formatLabel: traceFormats.find((f) => f.code === row.sourceFormat)!.label,
          rows: [
            {
              sourcePath: row.sourceFormat === 'langchain_trace' ? 'run_type' : row.sourceFormat === 'agent_trajectory' ? 'events[].type' : 'role',
              targetPath: 'event.role',
              description: '保留来源角色或节点类型',
              state: 'mapped',
            },
            {
              sourcePath:
                row.sourceFormat === 'langchain_trace'
                  ? 'name'
                  : row.sourceFormat === 'agent_trajectory'
                    ? 'events[].tool'
                    : 'function.name',
              targetPath: 'event.tool_name',
              description: '提取工具名称',
              state: 'mapped',
            },
            {
              sourcePath: row.sourceFormat === 'langchain_trace' ? 'inputs' : row.sourceFormat === 'agent_trajectory' ? 'events[].tool_args' : 'function.arguments',
              targetPath: 'event.input',
              description: '解析参数并保留原始内容',
              state: 'mapped',
            },
            {
              sourcePath: 'id / tool_call_id',
              targetPath: 'event.call_id',
              description: '调用与返回关联',
              state: 'mapped',
            },
            {
              sourcePath: '源文件与字段路径',
              targetPath: 'source_ref',
              description: '原文定位',
              state: 'generated',
            },
          ],
        },
        navigation: { previous: locator(idx - 1), next: locator(idx + 1) },
      }) as Detail
    },
    execute: (command, key) =>
      once(key, command, async () => {
        const s = state(command.input.batchId),
          taskId = `mock_task_${crypto.randomUUID()}`
        if (
          command.capabilityCode === 'agent_trace_ingest' &&
          s.batch.batchVersion !== command.input.expectedVersion
        )
          throw new Error('批次版本冲突')
        const task: TraceTask = {
          taskId,
          status: 'pending',
          progress: 0,
          result: {
            kind: command.capabilityCode,
            batchId: s.batch.batchId,
            snapshotId: s.batch.activeSnapshotId || '',
          },
        }
        if (
          [...jobs.values()].some(
            (j) =>
              j.task.result?.batchId === s.batch.batchId &&
              j.task.result.kind === command.capabilityCode &&
              ['pending', 'running'].includes(j.task.status),
          )
        )
          throw new Error('同类任务正在运行')
        jobs.set(taskId, {
          task,
          polls: 0,
          run: async () => {
            if (command.capabilityCode === 'agent_trace_export') {
              await exportJob(command, task)
              return
            }
            for (const file of s.files.filter(
              (f) => command.input.mode === 'reparse_all' || f.parseStatus !== 'succeeded',
            )) {
              const u = uploads.get(file.fileId)
              if (!u) continue
              const parsed: Stored[] = [],
                errors: FileRow['errorExamples'] = []
              const candidates = u.name.endsWith('.jsonl')
                ? u.content.split(/\r?\n/).filter((l) => l.trim())
                : [u.content]
              file.inputCandidateCount = candidates.length
              candidates.forEach((line, i) => {
                try {
                  const obj = JSON.parse(line),
                    p = parseTraceRecord(obj, file.formatOverride)
                  const calls = p.events.filter((e) => e.eventType === 'tool_call'),
                    returns = p.events.filter((e) => e.eventType === 'tool_result')
                  const ids = calls.map((e) => e.callId)
                  const linked =
                    new Set(ids).size === ids.length &&
                    calls.every(
                      (c) =>
                        returns.some((r) => r.callId === c.callId) ||
                        (p.format === 'langchain_trace' && c.outputJson != null),
                    )
                  const issueTypes = [
                    ...(!p.time ? ['time_missing'] : []),
                    ...(!p.usage ? ['usage_missing'] : []),
                    ...(!linked ? ['call_unlinked'] : []),
                  ]
                  file.detectedFormat = p.format
                  file.recognitionState = 'recognized'
                  parsed.push({
                    traceId: `${file.fileId}_${i}`,
                    displayId: `NEW-${i + 1}`,
                    sourceId: file.fileId,
                    filename: file.filename,
                    sourceFormat: p.format,
                    language: 'unknown',
                    testCategory: 'other',
                    eventCount: p.events.length,
                    callCount: calls.length,
                    issueTypes,
                    raw: JSON.stringify(obj, null, 2),
                    events: p.events,
                    paths: p.paths,
                    time: p.time,
                    usage: p.usage,
                    linked,
                  })
                } catch (e) {
                  errors.push({
                    lineStart: i + 1,
                    message: e instanceof Error ? e.message : '解析失败',
                  })
                }
              })
              s.rows = [...s.rows.filter((r) => r.sourceId !== file.fileId), ...parsed]
              file.parsedTraceCount = parsed.length
              file.failedRecordCount = errors.length
              file.errorExamples = errors.slice(0, 3)
              file.parseStatus = errors.length
                ? parsed.length
                  ? 'partial'
                  : 'failed'
                : 'succeeded'
            }
            if (!s.rows.length) throw new Error('没有可发布的有效轨迹，请检查文件错误')
            const snapshotId = `mock_snapshot_${crypto.randomUUID()}`
            s.batch.activeSnapshotId = snapshotId
            s.batch.stagingChanged = false
            s.snapshots.set(snapshotId, structuredClone(s.rows))
            task.result = {
              kind: 'agent_trace_ingest',
              batchId: s.batch.batchId,
              snapshotId,
              outcome: s.files.some((f) => f.failedRecordCount) ? 'partial' : 'complete',
            }
          },
        })
        return structuredClone(task)
      }),
    async task(id) {
      const j = jobs.get(id)
      if (!j) throw new Error('任务不存在')
      if (['pending', 'running'].includes(j.task.status)) {
        j.polls++
        j.task.status = 'running'
        j.task.progress = j.polls * 35
        if (j.polls >= 3) {
          try {
            await j.run()
            j.task.status = 'succeeded'
            j.task.progress = 100
          } catch (e) {
            j.task.status = 'failed'
            j.task.errorMessage = e instanceof Error ? e.message : '任务失败'
          }
        }
      }
      return structuredClone(j.task)
    },
    async ticket(id) {
      const a = artifacts.get(id)
      if (!a) throw new Error('产物不存在或已过期')
      const downloadUrl = URL.createObjectURL(a.blob)
      urls.push(downloadUrl)
      return {
        downloadUrl,
        filename: a.filename,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      }
    },
    dispose() {
      urls.forEach((url) => URL.revokeObjectURL(url))
    },
  }
  async function exportJob(command: Command, task: TraceTask) {
    const input = command.input,
      s = state(input.batchId),
      all = rowsFor(s, { snapshotId: input.snapshotId }),
      scope = input.scope
    if (!input.snapshotId) throw new Error('缺少快照')
    let rows =
      scope?.type === 'sample'
        ? all.filter((r) => scope.traceIds.includes(r.traceId))
        : scope?.type === 'filtered'
          ? filter(all, {
              sourceId: scope.sourceId || undefined,
              issueType: scope.issueType || undefined,
              q: scope.q || undefined,
            })
          : all
    if (!rows.length) throw new Error('导出范围为空')
    // Never export arbitrary uploaded text in the standard-redacted demonstration bundle.
    rows = rows.map((r, i) => ({ ...r, traceId: `ANON-${i + 1}`, displayId: `ANON-${i + 1}` }))
    const safe = rows.map((r) => ({
      trace_id: r.traceId,
      language: r.language,
      event_count: r.eventCount,
      events: r.events.map((e) => ({
        event_type: e.eventType,
        tool_name: e.toolName || null,
        call_id: e.callId || null,
        input_json: '"[已脱敏]"',
        output_json: '"[已脱敏]"',
      })),
    }))
    let blob: Blob, filename: string
    if (input.exportKind === 'view') {
      blob = await tracePng([
        '智能体轨迹审计 · 示例演示',
        `批次 ${s.batch.displayId} · 快照 ${input.snapshotId}`,
        `视图 ${input.view} · 轨迹 ${rows.length}`,
        ...safe.slice(0, 20).map((r) => `${r.trace_id}  ${r.language}  ${r.event_count} 个事件`),
        '内容已脱敏；此图为本地演示报告',
      ])
      filename = 'agent-trace-view.png'
    } else {
      const allowed = [
        'normalized_json',
        'offline_html',
        'evidence_index',
        'manifest',
        'error_report',
      ]
      if (input.contents?.some((c) => !allowed.includes(c))) throw new Error('包含尚未支持的导出项')
      const files = [
        {
          name: 'manifest.json',
          text: JSON.stringify(
            {
              batch_id: s.batch.batchId,
              snapshot_id: input.snapshotId,
              count: rows.length,
              contents: input.contents,
              redaction_profile: 'standard',
              anonymize_ids: true,
              mock: true,
            },
            null,
            2,
          ),
        },
      ]
      if (input.contents?.includes('normalized_json'))
        files.push({ name: 'normalized.json', text: JSON.stringify(safe, null, 2) })
      if (input.contents?.includes('offline_html'))
        files.push({
          name: 'report.html',
          text: `<!doctype html><meta charset="utf-8"><title>轨迹报告</title><h1>智能体轨迹审计 示例演示</h1><p>已脱敏轨迹 ${rows.length} 条</p><pre>${JSON.stringify(safe, null, 2).replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre>`,
        })
      if (input.contents?.includes('evidence_index'))
        files.push({
          name: 'evidence-index.json',
          text: JSON.stringify(
            rows.map((r) => ({ trace_id: r.traceId, event_count: r.eventCount })),
          ),
        })
      if (input.contents?.includes('error_report'))
        files.push({
          name: 'errors.json',
          text: JSON.stringify(s.files.map((f) => ({ failed_records: f.failedRecordCount }))),
        })
      blob = traceZip(files)
      filename = 'agent-trace-results.zip'
    }
    const artifactId = `mock_art_${crypto.randomUUID()}`
    artifacts.set(artifactId, { blob, filename })
    task.result = {
      kind: 'agent_trace_export',
      batchId: s.batch.batchId,
      snapshotId: input.snapshotId,
      artifacts: [
        {
          artifactId,
          filename,
          mimeType: blob.type,
          batchId: s.batch.batchId,
          snapshotId: input.snapshotId,
        },
      ],
    }
  }
  return api
}
