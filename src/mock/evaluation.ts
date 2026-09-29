/** Evaluation-only examples. In-memory edits reset on reload; no backend writes. */
import type { evaluationHttpApi } from '../api/evaluation'
import type {
  EvaluationConfig, EvaluationTask, EvaluationRun, Metric, MetricRevision,
  MetricResult, SourceContext, Evidence, ListFilters, EvaluationPageResult,
  RevisionDefinition, NamedValue, Issue,
} from '../types/evaluation'

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const date = '2026-09-28T09:00:00+08:00'
const now = () => new Date().toISOString()
let sequence = 10
const uid = (kind: string) => `demo-${kind}-${++sequence}`
function required<T>(value: T | undefined): T {
  if (!value) throw new Error('未找到指定的演示数据，请返回列表重新选择。')
  return value
}
function page<T>(items: T[], filters: ListFilters = {}, summary: NamedValue[] = []): EvaluationPageResult<T> {
  const current = Math.max(1, filters.page || 1)
  const size = Math.max(1, filters.pageSize || 10)
  return copy({ items: items.slice((current - 1) * size, current * size), total: items.length,
    page: current, pageSize: size, totalPages: Math.ceil(items.length / size), summary })
}
const definition: RevisionDefinition = {
  formulaCode: 'coverage', formulaVersion: 'demo-1.0', formula: 'TP / (TP + FN)',
  denominatorDefinition: '标准标签中应被预警的样本总数', positiveClass: '经人工标注的风险内容',
  unit: 'ratio', testMethod: 'automatic', applicableObjects: '内容安全检测结果', parameters: [],
  thresholds: [{ stage: 'midterm', comparator: 'gte', value: 0.9, unit: 'ratio' },
    { stage: 'final', comparator: 'gte', value: 0.95, unit: 'ratio' }],
  inputRequirements: ['标准标签', '预测结果', '样本编号'], requiredEvidence: ['样本明细', '计算过程'],
  sourceDocumentRefs: ['示例验收方案（仅演示）'],
}
const seeds: { code: string; name: string; category: Metric['category']; formula?: MetricRevision['formulaCode']; draft?: boolean }[] = [
  { code: 'alert_coverage', name: '风险预警覆盖率', category: 'risk_detect' },
  { code: 'false_positive_rate', name: '风险识别误报率', category: 'risk_detect', formula: 'fpr' },
  { code: 'classification_accuracy', name: '内容分类准确率', category: 'model_capability', formula: 'accuracy' },
  { code: 'value_recall', name: '高价值数据召回率', category: 'data_value', formula: 'recall' },
  { code: 'anomaly_recall', name: '异常数据识别召回率', category: 'data_governance', formula: 'recall' },
  { code: 'trace_complete', name: '全链路留痕完整性', category: 'compliance', formula: 'trace_complete' },
  { code: 'pollution_identification', name: '污染样本识别率', category: 'data_governance', draft: true },
  { code: 'risk_reduction', name: '治理后风险下降率', category: 'data_governance', formula: 'risk_reduction', draft: true },
]
const revisions: MetricRevision[] = []
const metrics: Metric[] = seeds.map((seed, index) => {
  const revision: MetricRevision = { ...copy(definition), metricId: `demo-metric-${index + 1}`,
    metricCode: seed.code, name: seed.name, category: seed.category,
    revisionId: `demo-revision-${index + 1}`, revisionNo: 1, expectedRevision: 1,
    configurationStatus: seed.draft ? 'needs_definition' : 'published', createdAt: date,
    publishedAt: seed.draft ? null : date, formulaCode: seed.draft ? 'needs_definition' : seed.formula || 'coverage' }
  if (seed.formula === 'fpr') {
    revision.formula = 'FP / (FP + TN)'
    revision.denominatorDefinition = '标准标签中的负类样本总数'
    revision.thresholds = [{ stage: 'midterm', comparator: 'lte', value: 0.1, unit: 'ratio' },
      { stage: 'final', comparator: 'lte', value: 0.05, unit: 'ratio' }]
  } else if (seed.formula === 'accuracy') {
    revision.formula = '(TP + TN) / (TP + FP + TN + FN)'
    revision.denominatorDefinition = '全部已标注样本'
  } else if (seed.formula === 'trace_complete') {
    revision.formula = '输入、输出、时间、接口、版本五要素全部完整'
    revision.unit = 'boolean'
    revision.testMethod = 'evidence'
    revision.thresholds = [{ stage: 'final', comparator: 'eq', value: 1, unit: 'boolean' }]
  }
  if (seed.draft) revision.formula = '待补齐业务定义'
  revisions.push(revision)
  return { metricId: revision.metricId, code: seed.code, name: seed.name, category: seed.category,
    description: '示例验收指标，用于展示配置、修订与阶段阈值。', status: 'enabled',
    activeRevision: seed.draft ? null : revision, latestRevision: revision,
    configurationStatus: revision.configurationStatus, issues: seed.draft
      ? [{ field: 'formula', reasonCode: 'needs_definition', message: '需补齐计算口径后发布' }] : [] }
})
const source: SourceContext = {
  entityType: 'task_result', entityId: 'demo-source', versionId: 'demo-source-v1',
  name: '多模态内容安全检测结果', sourceModule: 'risk-classification',
  sourceTaskId: 'demo-source-task', sourceTraceId: 'demo-trace', taskTraceId: 'demo-trace',
  capabilityCode: 'semantic_risk', status: 'succeeded', algorithmMode: 'mock',
  datasetId: 'demo-dataset', modelId: null, datasetVersion: '示例数据集 v2.1', labelVersion: '示例标签 v1.2',
  modelVersion: '示例模型 v1.0', evaluatorVersion: 'demo-1.0', contentHash: '示例摘要（未经真实校验）',
  sampleCount: 1000, canRerun: true, capturedAt: date, interface: '示例来源',
}
const baseConfig: EvaluationConfig = {
  schemaVersion: '1.0', targetStage: 'final', executionMode: 'reference',
  sourceRefs: [{ entityType: source.entityType, entityId: source.entityId, versionId: source.versionId }],
  datasetVersionRef: source.datasetVersion, labelVersionRef: source.labelVersion,
  modelVersionRef: source.modelVersion, metricRevisionRefs: revisions.slice(0, 3).map(r => r.revisionId),
  sampleScope: { mode: 'all' }, preflightToken: 'demo-preflight', retestOf: null,
}
const tasks: EvaluationTask[] = []
const runs: EvaluationRun[] = []
function resultsFor(run: EvaluationRun, passing: boolean): MetricResult[] {
  return run.snapshot.metricRevisions.map(revision => {
    const fpr = revision.formulaCode === 'fpr'
    const accuracy = revision.formulaCode === 'accuracy'
    const bool = revision.unit === 'boolean'
    const fp = passing ? 20 : 30
    const numerator = bool ? 1 : fpr ? fp : accuracy ? 980 - fp : 480
    const denominator = bool ? 1 : accuracy ? 1000 : 500
    const value = numerator / denominator
    const threshold = revision.thresholds.find(t => t.stage === run.config.targetStage) || null
    const passed = !!threshold && (threshold.comparator === 'lte' ? value <= threshold.value : value >= threshold.value)
    return { metricCode: revision.metricCode, name: revision.name, revisionId: revision.revisionId,
      value, unit: revision.unit, numerator, denominator,
      counts: bool ? [] : [{ name: 'TP', value: 480 }, { name: 'FN', value: 20 }, { name: 'FP', value: fp }, { name: 'TN', value: 500 - fp }],
      thresholdSnapshot: threshold, judgmentStatus: threshold ? passed ? 'passed' : 'failed' : 'inconclusive',
      reasonCode: threshold ? null : 'stage_target_missing', evidenceRefs: [`${run.runId}-${revision.metricCode}`],
      gap: threshold ? Number((value - threshold.value).toFixed(6)) : null,
      formula: revision.formula, formulaCode: revision.formulaCode }
  })
}
function makeTask(name: string, config: EvaluationConfig, status: EvaluationTask['status'], passing = false) {
  const taskId = uid('task'), runId = uid('run')
  const terminal = ['succeeded', 'failed', 'cancelled'].includes(status)
  const task: EvaluationTask = { taskId, runId, name, status, targetStage: config.targetStage,
    datasetVersion: config.datasetVersionRef, modelVersion: config.modelVersionRef,
    metricCount: config.metricRevisionRefs.length, judgmentStatus: 'not_evaluated',
    allowedActions: status === 'pending' ? ['start', 'cancel'] : status === 'running' ? ['cancel'] : status === 'failed' ? ['retry'] : [],
    createdAt: date, updatedAt: date, startedAt: status === 'pending' ? undefined : date,
    finishedAt: terminal ? date : undefined, stage: terminal ? 'archived' : status === 'pending' ? 'frozen' : 'calculating',
    traceId: `demo-trace-${taskId}`, processedCount: status === 'succeeded' ? 1000 : status === 'running' ? 640 : 0,
    totalCount: 1000, error: status === 'failed' ? '示例异常：来源服务暂不可用，可演示重试。' : undefined }
  const run: EvaluationRun = { runId, taskId, recordId: uid('record'), testNo: '',
    name, attemptNo: 1, retryOf: null, taskStatus: status, judgmentStatus: 'not_evaluated', algorithmMode: 'mock',
    startedAt: task.startedAt || null, finishedAt: task.finishedAt || null, createdAt: date,
    snapshot: { resolvedRefs: [copy(source)], metricRevisions: copy(revisions.filter(r => config.metricRevisionRefs.includes(r.revisionId))),
      datasetVersion: config.datasetVersionRef, labelVersion: config.labelVersionRef, modelVersion: config.modelVersionRef,
      sampleManifestHash: '示例摘要（未经真实校验）', sampleCount: 1000, sourceResultHashes: [source.contentHash],
      evaluatorVersion: 'demo-1.0', executionMode: config.executionMode, createdAt: date, targetStage: config.targetStage },
    metricResults: [], allowedActions: [], integrityState: 'incomplete', config: copy(config), error: task.error, exports: [] }
  if (status === 'succeeded') {
    run.metricResults = resultsFor(run, passing)
    run.judgmentStatus = run.metricResults.some(r => r.judgmentStatus === 'failed') ? 'failed' : 'passed'
    run.integrityState = 'complete'
    task.judgmentStatus = run.judgmentStatus
  }
  tasks.unshift(task); runs.unshift(run)
  return task
}
makeTask('多模态风险检测验收', baseConfig, 'succeeded')
makeTask('内容分类能力复测', baseConfig, 'succeeded', true)
makeTask('数据治理来源连通测试', baseConfig, 'failed')
makeTask('风险识别完成期验收', baseConfig, 'pending')
const running = makeTask('多模态内容安全评估', baseConfig, 'running')
export const demoExecutionTaskId = running.taskId
const getTask = (id: string) => required(tasks.find(t => t.taskId === id))
const getRun = (id: string) => required(runs.find(r => r.runId === id))
const getMetric = (id: string) => required(metrics.find(m => m.metricId === id))
const getRevision = (metricId: string, id: string) => required(revisions.find(r => r.metricId === metricId && r.revisionId === id))
function entries(run: EvaluationRun): Evidence[] {
  return run.metricResults.map(result => ({ evidenceId: result.evidenceRefs[0]!, runId: run.runId,
    kind: 'calculation', sourceRef: copy(source), sha256: '示例摘要（未经真实校验）', integrityState: 'complete',
    missingFields: [], redactedFields: ['原始内容'], capturedAt: date, allowedActions: [], mimeType: 'application/json',
    material: { source: copy(source), calculation: copy(result), capturedAt: date } }))
}
function filteredRuns(filters: ListFilters, archived = false) {
  return runs.filter(r => (!archived && !filters.terminalOnly || ['succeeded', 'failed', 'cancelled'].includes(r.taskStatus))
    && (!filters.keyword || `${r.name} ${r.testNo}`.includes(filters.keyword))
    && (!filters.judgmentStatus || r.judgmentStatus === filters.judgmentStatus)
    && (!filters.integrityState || r.integrityState === filters.integrityState)
    && (!filters.from || (r.finishedAt || '').slice(0, 10) >= filters.from)
    && (!filters.to || (r.finishedAt || '').slice(0, 10) <= filters.to))
}
function preflightIssues(config: EvaluationConfig): Issue[] {
  const issues: Issue[] = []
  if (!config.sourceRefs.length || config.sourceRefs.some(s => s.entityId !== source.entityId))
    issues.push({ field: 'sourceRefs', reasonCode: 'source_missing', message: '请选择示例来源。' })
  if (!config.metricRevisionRefs.length || config.metricRevisionRefs.some(id => !revisions.some(r => r.revisionId === id && r.configurationStatus === 'published')))
    issues.push({ field: 'metricRevisionRefs', reasonCode: 'metric_missing', message: '请选择已发布的示例指标。' })
  return issues
}
const noExport = async (): Promise<never> => { throw new Error('示例模式不生成正式报告或证据包，请接入真实后端后使用。') }
export const evaluationDemoApi: typeof evaluationHttpApi = {
  session: async () => ({ role: 'demo', allowedActions: ['write'] }),
  metrics: async (filters) => page(metrics.filter(m => (!filters.keyword || `${m.name} ${m.code}`.includes(filters.keyword))
    && (!filters.category || m.category === filters.category) && (!filters.status || m.status === filters.status)
    && (!filters.configurationStatus || m.configurationStatus === filters.configurationStatus)), filters),
  revisions: async (id) => page(revisions.filter(r => r.metricId === id).reverse(), { pageSize: 100 }),
  revision: async (id, revisionId) => copy(getRevision(id, revisionId)),
  createMetric: async input => {
    if (metrics.some(m => m.code === input.code)) throw new Error('此指标编码已存在。')
    const metricId = uid('metric')
    const revision: MetricRevision = { ...copy(definition), metricId, metricCode: input.code, name: input.name,
      category: input.category, revisionId: uid('revision'), revisionNo: 1, expectedRevision: 1,
      configurationStatus: 'draft', createdAt: now(), publishedAt: null }
    revisions.push(revision)
    const metric: Metric = { ...input, metricId, status: 'enabled', activeRevision: null,
      latestRevision: revision, configurationStatus: 'draft', issues: [] }
    metrics.unshift(metric); return copy(metric)
  },
  revise: async (id, value) => {
    const metric = getMetric(id)
    const revision: MetricRevision = { ...copy(value), metricId: id, metricCode: metric.code, name: metric.name,
      category: metric.category, revisionId: uid('revision'), revisionNo: (metric.latestRevision?.revisionNo || 0) + 1,
      expectedRevision: 1, configurationStatus: 'draft', createdAt: now(), publishedAt: null }
    revisions.push(revision); metric.latestRevision = revision; metric.configurationStatus = 'draft'
    return copy(revision)
  },
  patchRevision: async (id, revisionId, value, expected) => {
    const revision = getRevision(id, revisionId)
    if (revision.configurationStatus === 'published' || revision.expectedRevision !== expected) throw new Error('此修订不能修改，请刷新或新建修订。')
    Object.assign(revision, copy(value), { expectedRevision: expected + 1 }); return copy(revision)
  },
  publish: async (id, revisionId, expected) => {
    const revision = getRevision(id, revisionId)
    if (revision.expectedRevision !== expected || revision.formulaCode === 'needs_definition') throw new Error('请完善指标定义后再发布示例修订。')
    revision.configurationStatus = 'published'; revision.publishedAt = now(); revision.expectedRevision++
    Object.assign(getMetric(id), { activeRevision: revision, configurationStatus: 'published', issues: [] })
    return copy(revision)
  },
  metricStatus: async (id, status) => { const metric = getMetric(id); metric.status = status; return copy(metric) },
  contexts: async (kind, keyword) => ({ resolution: 'available', candidates: source.name.includes(keyword) ? [{ ...copy(source), entityType: kind }] : [], issues: [], allowedActions: ['select'] }),
  preflight: async config => {
    const issues = preflightIssues(config)
    return { token: issues.length ? null : 'demo-preflight', expiresAt: new Date(Date.now() + 600000).toISOString(),
      canCreate: !issues.length, issues, resolvedRefs: issues.length ? [] : [copy(source)] }
  },
  createTask: async (name, config) => {
    if (!name.trim() || config.preflightToken !== 'demo-preflight' || preflightIssues(config).length) throw new Error('请填写名称并完成示例预检。')
    return copy(makeTask(name, config, 'pending'))
  },
  tasks: async filters => page(tasks.filter(t => (!filters.keyword || t.name.includes(filters.keyword))
    && (!filters.status || t.status === filters.status) && (!filters.stage || t.targetStage === filters.stage)), filters,
    ['pending', 'running', 'failed'].map(name => ({ name, value: tasks.filter(t => t.status === name).length }))),
  task: async id => copy(getTask(id)),
  progress: async id => copy(getTask(id)),
  events: async (id, cursor) => {
    const task = getTask(id)
    const items = [{ eventId: `${id}-1`, stage: 'frozen', message: '示例计划已冻结，数据与指标版本已记录。', status: 'success', createdAt: date },
      { eventId: `${id}-2`, stage: task.stage, message: task.status === 'running' ? '演示进度停留在 64%，不会启动真实算法。' : `示例任务状态：${task.status}`, status: task.status, createdAt: task.updatedAt }]
    return { items: items.slice(cursor), nextCursor: items.length, hasMore: false }
  },
  start: async id => {
    const task = getTask(id)
    if (task.status !== 'pending') throw new Error('只有待启动的示例任务可以启动。')
    Object.assign(task, { status: 'succeeded', stage: 'archived', processedCount: 1000, startedAt: now(), finishedAt: now(), updatedAt: now(), allowedActions: [] })
    const run = getRun(task.runId); run.metricResults = resultsFor(run, false)
    run.judgmentStatus = run.metricResults.some(r => r.judgmentStatus === 'failed') ? 'failed' : 'passed'
    Object.assign(run, { taskStatus: task.status, startedAt: task.startedAt, finishedAt: task.finishedAt, integrityState: 'complete' })
    task.judgmentStatus = run.judgmentStatus; return copy(task)
  },
  cancel: async id => {
    const task = getTask(id)
    if (!['pending', 'running'].includes(task.status)) throw new Error('此示例任务已结束。')
    Object.assign(task, { status: 'cancelled', stage: 'archived', finishedAt: now(), updatedAt: now(), allowedActions: [] })
    Object.assign(getRun(task.runId), { taskStatus: 'cancelled', finishedAt: task.finishedAt })
    return copy(task)
  },
  retry: async (id, reason) => {
    const previous = getRun(id)
    if (previous.taskStatus !== 'failed' || !reason.trim()) throw new Error('请选择失败的示例任务并填写原因。')
    const task = makeTask(previous.name + '（重试）', previous.config, 'pending')
    Object.assign(getRun(task.runId), { retryOf: id, attemptNo: previous.attemptNo + 1 })
    return copy(task)
  },
  runs: async filters => page(filteredRuns(filters), filters),
  run: async id => copy(getRun(id)),
  records: async filters => page(filteredRuns(filters, true), filters),
  resolveRecord: async id => ({ resolution: runs.some(r => r.recordId === id) ? 'demo_only' : 'not_found', runId: null, candidates: [] }),
  samples: async (id, code, current) => {
    const result = required(getRun(id).metricResults.find(r => r.metricCode === code))
    const count = result.formulaCode === 'fpr' ? result.counts.find(c => c.name === 'FP')?.value || 0 : 20
    return page(Array.from({ length: count }, (_, index) => ({ sampleId: `demo-sample-${index + 1}`, expected: result.formulaCode !== 'fpr',
      predicted: result.formulaCode === 'fpr', baseline: null, required: true })), { page: current, pageSize: 10 })
  },
  manifest: async id => ({ entries: entries(getRun(id)), integrityState: getRun(id).integrityState,
    checks: ['input', 'output', 'time', 'interface', 'version'].map(name => ({ name, valid: getRun(id).taskStatus === 'succeeded' })) }),
  evidence: async id => copy(required(runs.flatMap(entries).find(e => e.evidenceId === id))),
  export: noExport, exportStatus: noExport, ticket: noExport,
}
