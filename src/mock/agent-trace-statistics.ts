import type {
  AgentTraceStatisticsApi,
  AgentTraceStatisticsQuery as Query,
  AgentTraceStatisticsSource as Source,
  AgentTraceStatisticsSample as Sample,
  AgentTraceStatisticsWorkspace as Workspace,
  AgentTraceContext,
  AgentTraceDistribution,
  AgentTraceMetric,
  AgentTraceStatisticsDetail,
  AgentTraceStatisticsExport,
} from '../types/agent-trace-statistics'
import type { TraceTask } from '../types/agent-traces'
import { traceZip } from '../utils/agent-trace-export'
import { statisticsPng } from '../utils/agent-trace-statistics-export'
import { statisticsReference } from './agent-trace-statistics-reference'

const categories = [
  'prompt_injection',
  'unauthorized_access',
  'privacy_leak',
  'harmful_content',
  'tool_misuse',
  'other',
]
const labels = ['提示注入', '越权访问', '隐私泄露', '有害内容', '工具滥用', '其他']
export const traceCategoryLabel = (code: string) => labels[categories.indexOf(code)] || '未知类别'
export const traceLanguageLabel = (code: string) =>
  ({ zh: '中文', en: 'English', all: '全部语言', other: '其他', unknown: '未知' })[code] || '未知'
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
const array = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.map(obj) : [])
const number = (v: unknown) =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null
const sum = (a: (number | null)[]) => a.reduce<number>((n, v) => n + (v ?? 0), 0)
const knownSum = (a: (number | null)[]) => (a.some((v) => v !== null) ? sum(a) : null)
const percent = (n: number, d: number) => (d ? Math.round((n / d) * 10000) / 100 : null)
const page = <T>(items: T[], p = 1, size = 6) => ({
  items: items.slice((p - 1) * size, p * size),
  total: items.length,
  page: p,
  pageSize: size,
  totalPages: Math.ceil(items.length / size),
})
export async function statisticsHash(text: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))),
  )
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')
}
export function projectStatistics(source: Source, q: Query) {
  const scope = {
    batchId: source.batch.batchId,
    snapshotId: q.snapshotId || source.batch.activeSnapshotId || '',
    projectionVersion: 'stats_1',
    language: q.language || 'all',
  }
  return source.rows
    .map((r, i): Sample => {
      const raw = obj(JSON.parse(r.raw)),
        usage = obj(raw.usage),
        audit = obj(raw.audit)
      const input = number(usage.input_tokens),
        reasoning = number(usage.reasoning_tokens)
      const output = number(usage.output_tokens)
      // An explicit source flag is required before summing reasoning with output.
      const final =
        output === null
          ? null
          : usage.output_excludes_reasoning === true
            ? output
            : usage.output_excludes_reasoning === false && reasoning !== null && output >= reasoning
              ? output - reasoning
              : null
      const duration = number(obj(raw.metadata).duration_ms)
      return {
        ...scope,
        traceId: r.traceId,
        displayId: r.displayId,
        sourceId: r.sourceId,
        filename: r.filename,
        sourceFormat: r.sourceFormat,
        language: ['zh', 'en', 'other'].includes(r.language) ? r.language : 'unknown',
        testCategory: r.testCategory,
        testCategoryLabel: traceCategoryLabel(r.testCategory),
        tokenUsage: {
          input,
          reasoningRecorded: reasoning,
          finalOutput: final,
          totalRecorded: knownSum([input, reasoning, final]),
          normalizationPolicy: 'exclusive_v1',
          availability: [input, reasoning, final].every((v) => v !== null)
            ? 'available'
            : 'partial',
        },
        eventCount: r.events.length,
        callCount: r.events.filter((e) => e.eventType === 'tool_call').length,
        retryCount: array(raw.tool_outcomes).filter(
          (e) => typeof e.attempt_index === 'number' && e.attempt_index > 1,
        ).length,
        durationMs: duration,
        taskStatus: String(raw.task_status || 'unknown'),
        auditDecision: String(audit.decision || 'unknown'),
        missingFields: [
          ...(!r.sourceId ? ['source'] : []),
          ...(duration === null ? ['time'] : []),
          ...(reasoning === null ? ['reasoning'] : []),
        ],
        availability: {
          source: r.sourceId ? 'available' : 'not_provided',
          time:
            duration !== null
              ? 'available'
              : obj(raw.metadata).duration_ms == null
                ? 'not_provided'
                : 'invalid',
          reasoning:
            reasoning !== null
              ? 'available'
              : usage.reasoning_tokens == null
                ? 'not_provided'
                : 'invalid',
        },
        allowedActions: { viewDetail: true, copyJson: true, exportJson: true },
        ingestOrder: i + 1,
      }
    })
    .filter((r) => scope.language === 'all' || r.language === scope.language)
}
function subset(rows: Sample[], q: Query) {
  return rows.filter((r) =>
    q.listFilter === 'risk'
      ? r.auditDecision === 'risk_found'
      : q.listFilter === 'missing_fields'
        ? !!r.missingFields.length
        : true,
  )
}
function context(source: Source, q: Query): AgentTraceContext {
  return {
    batchId: source.batch.batchId,
    snapshotId: q.snapshotId || source.batch.activeSnapshotId || '',
    projectionVersion: 'stats_1',
    language: q.language || 'all',
    listFilter: q.listFilter || 'all',
    pageSize: q.pageSize || 6,
    sort: 'ingest_order_asc_trace_id_asc',
    filterFingerprint: JSON.stringify([
      source.batch.batchId,
      q.snapshotId || source.batch.activeSnapshotId,
      q.language || 'all',
      q.listFilter || 'all',
      'stats_1',
    ]),
  }
}
export function aggregateStatistics(source: Source, q: Query): Workspace {
  const rows = projectStatistics(source, q),
    all = projectStatistics(source, { ...q, language: 'all' }),
    n = rows.length,
    ctx = context(source, q)
  const rawRows = rows.map((r) => source.rows.find((s) => s.traceId === r.traceId)!)
  const raw = rawRows.map((r) => obj(JSON.parse(r.raw)))
  const metric = (
    value: number | null,
    unit = 'count',
    valid = n,
    numerator?: number,
    denominator?: number,
  ): AgentTraceMetric => ({
    value,
    unit,
    availability:
      value === null ? (n ? 'unavailable' : 'not_applicable') : valid < n ? 'partial' : 'available',
    validSampleCount: valid,
    eligibleSampleCount: n,
    numerator,
    denominator,
  })
  const dist = (
    values: string[],
    names: Record<string, string>,
    keys = Object.keys(names),
  ): AgentTraceDistribution => ({
    availability: 'available',
    denominator: values.length,
    items: [...new Set([...keys, ...values])].map((code) => {
      const count = values.filter((v) => v === code).length
      return {
        code,
        label: names[code] || '未知',
        count,
        ratioPercent: percent(count, values.length),
      }
    }),
  })
  const calls = rawRows.flatMap((r) => r.events.filter((e) => e.eventType === 'tool_call'))
  const tools = [...new Set(calls.map((c) => c.toolName || 'unknown'))]
  const outcomes = raw.flatMap((r) => array(r.tool_outcomes)).map((r) => String(r.status))
  const terminal = outcomes.filter((r) => ['succeeded', 'failed', 'blocked'].includes(r))
  const times = rows
    .flatMap((r) => (r.durationMs === null ? [] : [r.durationMs]))
    .sort((a, b) => a - b)
  const quantile = (p: number) => (times.length ? times[Math.ceil(p * times.length) - 1] : null)
  const comparable = rows.filter(
    (r) => r.tokenUsage.reasoningRecorded !== null && r.tokenUsage.finalOutput !== null,
  )
  const numerator = sum(comparable.map((r) => r.tokenUsage.reasoningRecorded)),
    denominator = sum(comparable.map((r) => r.tokenUsage.finalOutput))
  const components = (['input', 'reasoningRecorded', 'finalOutput'] as const).map((code, i) => ({
    code,
    label: ['输入 Token', '已记录推理 Token', '最终输出 Token'][i],
    count: knownSum(rows.map((r) => r.tokenUsage[code])),
    validSampleCount: rows.filter((r) => r.tokenUsage[code] !== null).length,
    eligibleSampleCount: n,
    ratioPercent: null as number | null,
  }))
  const tokenTotal = knownSum(components.map((c) => c.count))
  components.forEach(
    (c) => (c.ratioPercent = tokenTotal && c.count !== null ? percent(c.count, tokenTotal) : null),
  )
  const coverage = (field: string) => {
    const availableCount = rows.filter((r) => !r.missingFields.includes(field)).length
    return {
      availableCount,
      missingCount: rows.filter((r) => r.availability[field] === 'not_provided').length,
      invalidCount: rows.filter((r) => r.availability[field] === 'invalid').length,
      notApplicableCount: 0,
      applicableCount: n,
      totalCount: n,
      ratePercent: percent(availableCount, n),
      availability: n ? 'available' : 'not_applicable',
    }
  }
  const listCounts = {
    all: n,
    risk: rows.filter((r) => r.auditDecision === 'risk_found').length,
    missing_fields: rows.filter((r) => r.missingFields.length).length,
  }
  const columns = ['unauthorized', 'argument_error', 'timeout', 'duplicate', 'retry'].map(
    (code, i) => ({ code, label: ['越权', '参数错误', '超时', '重复', '重试'][i] }),
  )
  const result: Workspace = {
    resolution: source.batch.activeSnapshotId ? (q.batchId ? 'resolved' : 'defaulted') : 'empty',
    resolvedSelection: ctx.snapshotId ? ctx : null,
    scope: ctx.snapshotId
      ? { ...ctx, sampleCount: n, schemaVersion: '1', policyVersion: 'demo_1' }
      : null,
    batchOptions: page(
      [
        {
          ...source.batch,
          sampleCount: all.length,
          languages: ['zh', 'en', 'other', 'unknown'].map((code) => ({
            code,
            count: all.filter((r) => r.language === code).length,
          })),
        },
      ],
      1,
      50,
    ),
    languageOptions: ['all', 'zh', 'en', 'other', 'unknown'].map((code) => ({
      code,
      label: traceLanguageLabel(code),
      count: code === 'all' ? all.length : all.filter((r) => r.language === code).length,
    })),
    kpis: {
      sampleCount: metric(n),
      riskSampleCount: metric(listCounts.risk),
      recordedTokens: metric(
        tokenTotal,
        'token',
        rows.filter((r) => r.tokenUsage.availability === 'available').length,
      ),
      reasoningOutputRatio: {
        ...metric(
          denominator ? Math.round((numerator / denominator) * 100) / 100 : null,
          'ratio',
          comparable.length,
          numerator,
          denominator,
        ),
        reason: denominator ? null : '同口径输出总量为零或未提供',
      },
      toolCallCount: metric(calls.length),
      toolTypeCount: metric(tools.length),
      averageSteps: metric(n ? sum(rows.map((r) => r.eventCount)) / n : null, 'step'),
      taskSuccessRate: metric(
        percent(rows.filter((r) => r.taskStatus === 'completed').length, n),
        'percent',
      ),
    },
    charts: {
      testCategoryDistribution: dist(
        rows.map((r) => r.testCategory),
        Object.fromEntries(categories.map((c, i) => [c, labels[i]])),
      ),
      tokenComposition: {
        availability: tokenTotal === null ? 'unavailable' : 'partial',
        mutuallyExclusive: true,
        normalizedPolicy: 'exclusive_v1：输出按源标志排除推理，未知分量不补零',
        compatibleSampleCount: comparable.length,
        incompatibleSampleCount: n - comparable.length,
        totalRecorded: tokenTotal,
        components,
      },
      toolRanking: {
        availability: 'available',
        totalCallCount: calls.length,
        toolTypeCount: tools.length,
        rankingOrder: 'count_desc',
        items: tools
          .map((toolCode) => ({
            toolCode,
            label: toolCode,
            count: calls.filter((c) => (c.toolName || 'unknown') === toolCode).length,
            isOther: false,
          }))
          .sort((a, b) => b.count - a.count),
      },
      durationDistribution: {
        availability: times.length ? 'available' : 'unavailable',
        reason: times.length ? null : '未提供有效时长',
        validCount: times.length,
        missingCount: rows.filter((r) => r.availability.time === 'not_provided').length,
        invalidCount: rows.filter((r) => r.availability.time === 'invalid').length,
        totalCount: n,
        unit: 'ms',
        quantileMethod: 'nearest_rank',
        p50Ms: quantile(0.5),
        p95Ms: quantile(0.95),
        buckets: [1000, 2000, 4000, 6000, 8000, 10000, null].map((upperMs, i, bounds) => ({
          code: `bucket_${i}`,
          label: ['≤1', '(1,2]', '(2,4]', '(4,6]', '(6,8]', '(8,10]', '>10'][i],
          lowerMs: i ? bounds[i - 1]! : 0,
          upperMs,
          lowerInclusive: i === 0,
          upperInclusive: true,
          count: times.filter(
            (t) => (i ? t > bounds[i - 1]! : t >= 0) && (upperMs === null || t <= upperMs),
          ).length,
        })),
      },
      toolResultDistribution: {
        ...dist(terminal, { succeeded: '成功', failed: '错误', blocked: '拦截' }),
        totalCallCount: calls.length,
        terminalCount: terminal.length,
        nonTerminalCount: outcomes.filter((r) => ['running', 'pending'].includes(r)).length,
        unknownCount:
          calls.length -
          outcomes.length +
          outcomes.filter(
            (r) => !['succeeded', 'failed', 'blocked', 'running', 'pending'].includes(r),
          ).length,
      },
      behaviorMatrix: {
        availability: raw.some((r) => Array.isArray(r.behavior_events))
          ? 'available'
          : 'unavailable',
        reason: '未采集异常行为事件时不能按零解释',
        rowDimension: 'test_category',
        unit: 'event_occurrence',
        overlapAllowed: true,
        columns,
        rows: categories.map((categoryCode, i) => ({
          categoryCode,
          label: labels[i],
          cells: columns.map((c) => ({
            behaviorCode: c.code,
            count: rows.reduce(
              (total, r, index) =>
                total +
                (r.testCategory === categoryCode
                  ? new Set(
                      array(raw[index].behavior_events)
                        .filter((e) => e.behavior_code === c.code)
                        .map((e) => e.event_id),
                    ).size
                  : 0),
              0,
            ),
          })),
        })),
      },
      sourceDistribution: dist(
        raw.map((r) => String(r.entry_source || 'unknown')),
        {
          platform: '平台调用',
          scenario: '场景应用',
          external_import: '外部导入',
          unknown: '未知来源',
        },
      ),
      languageDistribution: dist(
        rows.map((r) => r.language),
        { zh: '中文', en: 'English', other: '其他', unknown: '未知' },
      ),
    },
    completeness: {
      source: coverage('source'),
      time: coverage('time'),
      reasoning: coverage('reasoning'),
      requiredFields: ['source', 'time', 'reasoning'],
      missingUnionCount: listCounts.missing_fields,
      overlapSummary: {
        sourceMissingCount: coverage('source').missingCount,
        timeMissingCount: coverage('time').missingCount,
        reasoningMissingCount: coverage('reasoning').missingCount,
        timeAndReasoningCount: rows.filter(
          (r) => r.missingFields.includes('time') && r.missingFields.includes('reasoning'),
        ).length,
      },
    },
    listCounts,
    listContext: ctx,
    samplePage: { ...page(subset(rows, q), q.page, q.pageSize), context: ctx },
    permissions: {
      canViewStatistics: true,
      canListSamples: true,
      canViewDetail: true,
      canCopyJson: true,
      canViewRaw: true,
      canExport: true,
    },
    exportOptions: {
      kinds: ['view', 'package', 'sample_json'].map((exportKind, i) => ({
        exportKind,
        formats: [['png'], ['zip'], ['json']][i],
        availability: 'available',
      })),
      contents: [
        'stats_summary',
        'sample_table',
        'normalized_json',
        'manifest',
        'statistics_png',
      ].map((code) => ({ code, label: code, availability: 'available' })),
      requiredContents: ['manifest'],
      redactionProfiles: ['standard'],
      defaultScope: 'filtered',
      maxSelectedTraceIds: 100,
    },
    moduleAvailability: Object.fromEntries(
      ['ingest', 'statistics', 'execution', 'tools'].map((c) => [c, { availability: 'available' }]),
    ),
    warnings: [
      {
        code: 'shared_mock_snapshot',
        panel: 'all',
        message: '演示统计与接入页使用同一快照；数值按实际轨迹计算，未照抄截图。',
      },
    ],
  }
  if (result.charts.toolRanking.items.length > 5) {
    const ranking = result.charts.toolRanking,
      tail = ranking.items.slice(4)
    ranking.items = [
      ...ranking.items.slice(0, 4),
      {
        toolCode: 'other',
        label: '其他',
        count: tail.reduce((n, r) => n + r.count, 0),
        isOther: true,
        mergedToolCount: tail.length,
      },
    ]
    ranking.rankingOrder = 'other_last'
  }
  return result
}

export function createAgentTraceStatisticsMock(
  source: (q: Query) => Source[],
  reference = false,
): AgentTraceStatisticsApi {
  const jobs = new Map<
      string,
      { task: TraceTask; command: AgentTraceStatisticsExport; blob?: Blob; filename?: string }
    >(),
    keys = new Map<string, { payload: string; id: string }>(),
    urls: string[] = []
  function get(q: Query) {
    if (q.projectionVersion && q.projectionVersion !== 'stats_1')
      throw new Error('410：统计投影已过期，请重新查询')
    if (q.language && !['all', 'zh', 'en', 'other', 'unknown'].includes(q.language))
      throw new Error('422：语言无效')
    if (q.listFilter && !['all', 'risk', 'missing_fields'].includes(q.listFilter))
      throw new Error('422：列表筛选无效')
    if (q.page !== undefined && (!Number.isInteger(q.page) || q.page < 1))
      throw new Error('422：页码无效')
    if (
      q.pageSize !== undefined &&
      (!Number.isInteger(q.pageSize) || q.pageSize < 1 || q.pageSize > 100)
    )
      throw new Error('422：页面大小无效')
    const sources = source(q)
    const s = q.batchId
      ? sources.at(-1)
      : [...sources].reverse().find((s) => s.batch.activeSnapshotId) || sources.at(-1)
    if (!s) throw new Error('没有可访问批次')
    return reference ? statisticsReference(s) : s
  }
  async function detail(
    batchId: string,
    traceId: string,
    q: Query,
    full = false,
  ): Promise<AgentTraceStatisticsDetail> {
    const s = get({ ...q, batchId }),
      rows = subset(projectStatistics(s, q), q),
      index = rows.findIndex((r) => r.traceId === traceId),
      row = rows[index]
    if (!row) throw new Error('409：样本不属于当前筛选范围')
    const original = s.rows.find((r) => r.traceId === traceId)!,
      raw = obj(JSON.parse(original.raw)),
      ctx = context(s, q),
      size = q.pageSize || 6
    const events = original.events.map((e) => ({
      event_id: e.eventId,
      ordinal: e.ordinal,
      event_type: e.eventType,
      tool_name: e.toolName,
      call_id: e.callId,
      input_json: e.inputJson,
      output_json: e.outputJson,
    }))
    const jsonText = JSON.stringify(
      {
        trace_id: row.traceId,
        display_id: row.displayId,
        batch_id: batchId,
        snapshot_id: ctx.snapshotId,
        language: row.language,
        test_category: row.testCategory,
        task_status: row.taskStatus,
        audit: raw.audit || { decision: 'unknown' },
        tokens: {
          input: row.tokenUsage.input,
          reasoning_recorded: row.tokenUsage.reasoningRecorded,
          final_output: row.tokenUsage.finalOutput,
          total_recorded: row.tokenUsage.totalRecorded,
        },
        event_count: row.eventCount,
        tool_call_count: row.callCount,
        retry_count: row.retryCount,
        duration_ms: row.durationMs,
        events,
        source_record: raw,
        preview_scope: { is_complete: true, events_total: events.length },
      },
      null,
      2,
    )
    const bytes = new TextEncoder().encode(jsonText).length
    const contentVersion = await statisticsHash(jsonText + original.raw)
    const block = (text: string, representation: 'sample' | 'raw', limit: number) => {
      let start = 0
      if (q.contentCursor && q.representation === representation) {
        const [kind, position, version] = q.contentCursor.split(':')
        start = Number(position)
        if (
          kind !== representation ||
          version !== contentVersion ||
          !Number.isInteger(start) ||
          start <= 0 ||
          start >= text.length
        )
          throw new Error('410：内容游标已失效')
      }
      let end = start,
        length = 0
      if (full) end = text.length
      else
        for (const character of text.slice(start)) {
          const size = new TextEncoder().encode(character).length
          if (length + size > limit) break
          length += size
          end += character.length
        }
      return {
        text: text.slice(start, end),
        offsetBytes: new TextEncoder().encode(text.slice(0, start)).length,
        complete: end === text.length,
        contentVersion,
        nextCursor: end < text.length ? `${representation}:${end}:${contentVersion}` : null,
      }
    }
    const sampleBlock = block(jsonText, 'sample', 262144),
      rawBlock = block(original.raw, 'raw', 65536)
    const neighbor = (i: number) =>
      rows[i]
        ? { traceId: rows[i].traceId, displayId: rows[i].displayId, page: Math.floor(i / size) + 1 }
        : null
    return {
      ...ctx,
      traceId,
      displayId: row.displayId,
      summary: row,
      audit: {
        decision: row.auditDecision,
        riskTypes: Array.isArray(obj(raw.audit).risk_types)
          ? (obj(raw.audit).risk_types as string[])
          : [],
        evidenceRefs: [],
        policyVersion: 'demo_1',
        availability: row.auditDecision === 'unknown' ? 'unavailable' : 'available',
      },
      sampleJson: {
        availability: 'available',
        jsonText: sampleBlock.text,
        isValidJson: sampleBlock.complete && sampleBlock.offsetBytes === 0,
        complete: sampleBlock.complete && sampleBlock.offsetBytes === 0,
        truncated: !sampleBlock.complete,
        loadedBytes: new TextEncoder().encode(sampleBlock.text).length,
        totalBytes: bytes,
        contentVersion,
        contentSha256: await statisticsHash(sampleBlock.text),
        nextCursor: sampleBlock.nextCursor,
        previewScope: {
          isComplete: sampleBlock.complete,
          messagesShown: sampleBlock.complete ? array(raw.messages).length : 0,
          messagesTotal: array(raw.messages).length,
          eventsShown: sampleBlock.complete ? events.length : 0,
          eventsTotal: events.length,
        },
      },
      rawPreview: {
        availability: 'available',
        rawText: rawBlock.text,
        kind: 'record',
        lineStart: 1,
        lineEnd: rawBlock.text.split('\n').length,
        totalLines: original.raw.split('\n').length,
        truncated: !rawBlock.complete,
        nextCursor: rawBlock.nextCursor,
      },
      sourceRef: { sourceId: row.sourceId, recordIndex: row.ingestOrder, sourcePath: '$' },
      mapping: {
        formatCode: row.sourceFormat,
        formatLabel: row.sourceFormat,
        mappingVersion: '1',
        rows: [
          {
            sourcePath: original.paths[0] || '$',
            targetPath: 'events[0]',
            description: '来源事件映射',
            state: 'mapped',
          },
          {
            sourcePath: 'usage.input_tokens',
            targetPath: 'tokens.input',
            description: '已记录输入用量',
            state: 'mapped',
          },
          {
            sourcePath: '$',
            targetPath: 'event_count',
            description: '规范事件聚合计数',
            state: 'generated',
          },
        ],
      },
      navigation: {
        previous: neighbor(index - 1),
        next: neighbor(index + 1),
        position: index + 1,
        total: rows.length,
        page: Math.floor(index / size) + 1,
        pageSize: size,
        context: ctx,
      },
      permissions: {
        viewDetail: true,
        viewRaw: true,
        copyJson: true,
        exportJson: true,
        redactionProfile: 'standard',
      },
      contentChunk: q.contentCursor ? (q.representation === 'raw' ? rawBlock : sampleBlock) : null,
    }
  }
  const api: AgentTraceStatisticsApi = {
    async statistics(q) {
      const w = aggregateStatistics(get(q), q)
      const opts = source({})
        .filter((s) => !q.optionQ || `${s.batch.displayId} ${s.batch.name}`.includes(q.optionQ))
        .map((s) => ({
          ...s.batch,
          sampleCount: s.rows.length,
          languages: ['zh', 'en'].map((code) => ({
            code,
            count: s.rows.filter((r) => r.language === code).length,
          })),
        }))
      w.batchOptions = page(opts, q.optionPage || 1, q.optionPageSize || 50)
      return w
    },
    async samples(batchId, q) {
      const s = get({ ...q, batchId })
      return {
        ...page(subset(projectStatistics(s, q), q), q.page, q.pageSize),
        context: context(s, q),
      }
    },
    sample: (batchId, traceId, q) => detail(batchId, traceId, q),
    async export(command, key) {
      get(command.input)
      const payload = JSON.stringify(command),
        cached = keys.get(key)
      if (cached) {
        if (cached.payload !== payload) throw new Error('409：幂等键对应不同请求')
        return structuredClone(jobs.get(cached.id)!.task)
      }
      const taskId = `mock_stats_task_${crypto.randomUUID()}`,
        task: TraceTask = { taskId, status: 'pending', progress: 0 }
      jobs.set(taskId, { task, command })
      keys.set(key, { payload, id: taskId })
      return structuredClone(task)
    },
    async task(id) {
      const job = jobs.get(id)
      if (!job) throw new Error('404：任务不存在')
      if (job.task.status === 'pending') {
        job.task.status = 'running'
        job.task.progress = 30
        return structuredClone(job.task)
      }
      if (job.task.status === 'running') {
        try {
          const input = job.command.input,
            q = { ...input, language: input.scope.language, listFilter: input.scope.listFilter },
            s = get(q),
            w = aggregateStatistics(s, q)
          const rows = subset(projectStatistics(s, q), q).filter(
            (r) => input.scope.type !== 'sample' || input.scope.traceIds.includes(r.traceId),
          )
          const aliases = new Map(
            s.rows.flatMap((r, i) => [
              [r.traceId, `sample_${String(i + 1).padStart(4, '0')}`],
              [r.displayId, `SAMPLE-${String(i + 1).padStart(4, '0')}`],
            ]),
          )
          const anonymize = (text: string) =>
            input.anonymizeIds
              ? JSON.stringify(
                  JSON.parse(text),
                  (_key, value) =>
                    typeof value === 'string' ? aliases.get(value) || value : value,
                  2,
                )
              : text
          if (input.exportKind === 'sample_json' && rows.length !== 1)
            throw new Error('422：必须选择当前范围内的一条样本')
          job.filename = `${s.batch.displayId}-${input.exportKind}.${input.format}`
          if (input.exportKind === 'sample_json')
            job.blob = new Blob(
              [
                anonymize(
                  (await detail(s.batch.batchId, rows[0].traceId, q, true)).sampleJson.jsonText,
                ),
              ],
              { type: 'application/json' },
            )
          else if (input.exportKind === 'view')
            job.blob = await statisticsPng(
              JSON.parse(
                anonymize(
                  JSON.stringify(
                    aggregateStatistics(s, {
                      ...q,
                      listFilter: input.uiState?.listFilter,
                      page: input.uiState?.page,
                      pageSize: input.uiState?.pageSize,
                    }),
                  ),
                ),
              ),
            )
          else {
            const files: { name: string; text: string }[] = []
            if (input.contents.includes('stats_summary'))
              files.push({
                name: 'stats_summary.json',
                text: JSON.stringify(
                  { scope: w.scope, kpis: w.kpis, charts: w.charts, completeness: w.completeness },
                  null,
                  2,
                ),
              })
            if (input.contents.includes('sample_table'))
              files.push({ name: 'sample_table.json', text: JSON.stringify(rows, null, 2) })
            if (input.contents.includes('normalized_json'))
              for (const r of rows)
                files.push({
                  name: `samples/${r.traceId}.json`,
                  text: (await detail(s.batch.batchId, r.traceId, q, true)).sampleJson.jsonText,
                })
            for (const file of files) {
              file.text = anonymize(file.text)
              if (input.anonymizeIds && file.name.startsWith('samples/'))
                file.name = `samples/${aliases.get(file.name.slice(8, -5))}.json`
            }
            const manifest = {
              schema_version: '1',
              batch_id: s.batch.batchId,
              snapshot_id: input.snapshotId,
              projection_version: input.projectionVersion,
              policy_version: 'demo_1',
              created_at: new Date().toISOString(),
              aggregate_scope: { language: q.language, sample_count: w.listCounts.all },
              sample_scope: input.scope,
              filter_fingerprint: w.listContext.filterFingerprint,
              sample_count: rows.length,
              contents: input.contents,
              redaction_profile: input.redactionProfile,
              anonymize_ids: input.anonymizeIds,
              files: await Promise.all(
                files.map(async (f) => ({
                  path: f.name,
                  mime_type: 'application/json',
                  size_bytes: new TextEncoder().encode(f.text).length,
                  sha256: await statisticsHash(f.text),
                })),
              ),
            }
            files.push({ name: 'manifest.json', text: JSON.stringify(manifest, null, 2) })
            job.blob = traceZip(files)
          }
          job.task = {
            taskId: id,
            status: 'succeeded',
            progress: 100,
            result: {
              kind: 'agent_trace_export',
              batchId: input.batchId,
              snapshotId: input.snapshotId,
              artifacts: [
                {
                  artifactId: id,
                  filename: job.filename,
                  mimeType: job.blob.type,
                  batchId: input.batchId,
                  snapshotId: input.snapshotId,
                },
              ],
            },
          }
        } catch (e) {
          job.task.status = 'failed'
          job.task.errorMessage = e instanceof Error ? e.message : '导出失败'
        }
      }
      return structuredClone(job.task)
    },
    async ticket(id) {
      const job = jobs.get(id)
      if (!job?.blob || !job.filename) throw new Error('404：产物未就绪')
      const url = URL.createObjectURL(job.blob)
      urls.push(url)
      return {
        downloadUrl: url,
        filename: job.filename,
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      }
    },
    dispose() {
      urls.forEach((u) => URL.revokeObjectURL(u))
      urls.length = 0
      jobs.clear()
      keys.clear()
    },
  }
  return api
}
