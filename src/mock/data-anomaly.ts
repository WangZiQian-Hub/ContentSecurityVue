import { resourceDatasets } from './resource-catalog'
import {
  governanceResources,
  resourceVersionSamples,
  registerResourceVersion,
  validateResourceScope,
} from './governance-resources'
import type {
  Candidate,
  ChangeSet,
  Options,
  Overview,
  Published,
  Query,
  Result,
  Sample,
  Scope,
  Task,
  VersionCheck,
} from '../types/data-anomaly'
const copy = <T>(x: T): T => structuredClone(x)
const now = () => new Date().toISOString()
const uid = (prefix: string) => `${prefix}_${crypto.randomUUID()}`
const types = ['标签异常', '重复记录', '格式异常', '字段缺失']
const ruleNames = [
  '主题标签一致性',
  '精确重复',
  '日期格式',
  '来源必填',
  '样本ID必填',
  '正文必填',
  '语种必填',
  '语种枚举',
  '标签枚举',
  '字段类型',
  '字符编码',
  '空白字符',
  '日期有效性',
  '元数据结构',
  '正文长度',
  '来源格式',
  '修订引用完整性',
  '重复组主记录',
  '必填字段非空',
  '字段白名单',
]
export const anomalyOptions: Options = {
  get datasets() {
    return governanceResources()
  },
  schemes: [{ id: 'anomaly-basic-v1', name: '基础异常检测 v1.0' }],
  types,
  rules: ruleNames.map((name, i) => ({
    id: `anomaly-rule-${i + 1}`,
    name,
    description: `${name}；演示方案规则定义，真实执行由后端实现。`,
  })),
}
const records = new Map<string, { result: Result; samples: Sample[] }>()
const tasks = new Map<string, Task>()
const sets = new Map<string, ChangeSet>()
const checks = new Map<string, { setId: string; fingerprint: string }>()
export const publishedSnapshots = new Map<string, Sample[]>()
const key = (s: Scope) => `${s.datasetId}/${s.versionId}`
const sameScope = (a: Scope, b: Scope) =>
  a.datasetId === b.datasetId &&
  a.versionId === b.versionId &&
  a.language === b.language &&
  a.schemeId === b.schemeId
function actions(row: Sample) {
  const c = row.candidates.at(-1)
  row.actions = !c || ['DRAFT', 'REJECTED', 'WITHDRAWN'].includes(c.status) ? ['generate'] : []
  if (c?.status === 'DRAFT') row.actions.push('submit')
  if (c?.status === 'PENDING_REVIEW') row.actions.push('approve', 'reject', 'withdraw')
}
function candidate(row: Sample): Candidate {
  return {
    candidateId: uid('candidate'),
    inputSampleRevisionId: row.revisionId,
    status: 'DRAFT',
    fieldChanges: [{ field: 'topic_label', before: row.metadata.topic_label!, after: '文化' }],
    reason: row.findings[0]!.reason,
    validationResults: [{ name: '字段白名单、类型及原文引用校验', passed: true }],
  }
}
function refresh(id: string) {
  const r = records.get(id)!
  r.result.anomalyCount = r.samples.length
  r.result.ratio = r.result.validCount ? (r.samples.length / r.result.validCount) * 100 : 0
  r.result.pendingCount = r.samples.filter((s) => s.status === '待处理').length
  r.result.reviewCount = r.samples.filter((s) => s.status === '待复核').length
  r.result.processedCount = r.samples.filter((s) => s.status === '已处理').length
  r.result.primaryTypeCounts = types.map((type) => ({
    type,
    count: r.samples.filter((s) => s.primaryType === type).length,
  }))
  r.samples.forEach(actions)
  return r
}
function createResult(scope: Scope, taskId: string, seed = false) {
  validateResourceScope(scope)
  const resources = resourceVersionSamples(scope.datasetId, scope.versionId).filter(
    (s) =>
      s.datasetId === scope.datasetId &&
      s.versionId === scope.versionId &&
      (scope.language === 'all' || s.language === scope.language),
  )
  // 完整资源集合；仅文化正文具有已存储演示标签证据，不制造重复或来源证据。
  const samples: Sample[] = resources
    .filter((s) => s.text.includes('文化传承') && s.metadata?.topic_label !== '文化')
    .map((s) => {
      const row: Sample = {
        ...copy(s),
        revisionId: `${s.versionId}:${s.id}`,
        primaryType: types[0]!,
        status: '待处理',
        metadata: { ...s.metadata, topic_label: s.metadata?.topic_label || '体育' },
        source: {},
        findings: [
          {
            type: types[0]!,
            field: 'topic_label',
            reason: '正文介绍社区节庆与文化传承，与体育标签不一致（预置演示证据）',
            quote: '居民展示传统手工艺，讲述地方习俗与文化传承',
            ruleId: 'anomaly-rule-1',
          },
        ],
        candidates: [],
        timeline: [{ at: now(), message: '载入预置检测证据，未调用 LLM' }],
        actions: [],
      }
      row.candidates.push(candidate(row))
      return row
    })
  const id = uid('anomaly-result')
  const result: Result = {
    id,
    taskId,
    scope: copy(scope),
    datasetName: resourceDatasets.find((d) => d.id === scope.datasetId)!.name,
    versionLabel: scope.versionId,
    finishedAt: now(),
    validCount: resources.length,
    failedCount: 0,
    unavailableCount: 0,
    anomalyCount: 0,
    ratio: 0,
    pendingCount: 0,
    reviewCount: 0,
    processedCount: 0,
    primaryTypeCounts: [],
  }
  records.set(id, { result, samples })
  refresh(id)
  if (seed)
    samples.slice(0, 12).forEach((row) => {
      row.candidates[0]!.status = 'PENDING_REVIEW'
      row.status = '待复核'
      mutate(id, row.id, 'approve')
    })
  return result
}
function getSet(scope: Scope) {
  if (!sets.has(key(scope)))
    sets.set(key(scope), {
      id: uid('changeset'),
      datasetId: scope.datasetId,
      versionId: scope.versionId,
      versionLabel: scope.versionId,
      updatedAt: now(),
      entries: [],
      excluded: [],
      conflicts: 0,
      actions: [],
    })
  const set = sets.get(key(scope))!
  set.conflicts = set.entries.filter((e) => e.conflict).length
  set.actions = set.entries.length && !set.conflicts ? ['publish'] : []
  return set
}
function mutate(
  resultId: string,
  sampleId: string,
  action: string,
  candidateId?: string,
  inputSampleRevisionId?: string,
) {
  const { result, samples } = refresh(resultId)
  const row = samples.find((s) => s.id === sampleId)
  if (!row) throw new Error('样本不存在')
  actions(row)
  if (!row.actions.includes(action)) throw new Error('当前状态不允许该操作，请刷新')
  const c = row.candidates.at(-1)!
  if (
    (candidateId && candidateId !== c?.candidateId) ||
    (inputSampleRevisionId && inputSampleRevisionId !== row.revisionId)
  )
    throw new Error('候选或输入修订已变化，请刷新后重试')
  if (action === 'generate') {
    const next = candidate(row)
    if (c?.status === 'DRAFT') {
      next.replacesCandidateId = c.candidateId
      c.status = 'WITHDRAWN'
    }
    row.candidates.push(next)
  }
  if (action === 'submit') {
    c.status = 'PENDING_REVIEW'
    row.status = '待复核'
  }
  if (action === 'withdraw' || action === 'reject') {
    c.status = action === 'reject' ? 'REJECTED' : 'WITHDRAWN'
    row.status = '待处理'
  }
  if (action === 'approve') {
    c.status = 'APPROVED'
    row.status = '已处理'
    row.resolution = '审核通过，待生成版本'
    const set = getSet(result.scope)
    const existing = set.entries.find((e) => e.sampleId === row.id)
    set.entries.push({
      sampleId: row.id,
      candidateId: c.candidateId,
      changes: copy(c.fieldChanges),
      ...(existing ? { conflict: '同一样本已有已审核建议，请移除冲突条目' } : {}),
    })
    set.updatedAt = now()
  }
  row.timeline.push({
    at: now(),
    message: (
      {
        generate: '创建新修复候选',
        submit: '提交人工复核',
        approve: '审核通过并加入修改集',
        reject: '审核驳回',
        withdraw: '撤回审核',
      } as Record<string, string>
    )[action]!,
  })
  refresh(resultId)
  return copy(row)
}
export const anomalyMock = {
  options: () => copy(anomalyOptions),
  overview(): Overview {
    const all = [...records.keys()].reverse().map(refresh)
    const seen = new Set<string>(),
      current: Sample[] = []
    for (const { result, samples } of all) {
      for (const source of resourceVersionSamples(
        result.scope.datasetId,
        result.scope.versionId,
      ).filter((s) => result.scope.language === 'all' || result.scope.language === s.language)) {
        const key = `${source.datasetId}/${source.versionId}/${source.id}`
        if (seen.has(key)) continue
        seen.add(key)
        const sample = samples.find((s) => s.id === source.id)
        if (sample) current.push(sample)
      }
    }
    const published = new Set(
      all.flatMap((r) =>
        r.samples
          .filter((s) => s.candidates.some((c) => c.status === 'PUBLISHED'))
          .map((s) => `${s.datasetId}/${s.versionId}/${s.id}`),
      ),
    )
    return {
      cards: [
        {
          label: '已检测语料',
          value: seen.size,
          icon: 'Document',
        },
        { label: '检出异常', value: current.length, icon: 'WarningFilled' },
        {
          label: '待复核样本',
          value: current.filter((s) => s.status === '待复核').length,
          icon: 'Tickets',
        },
        {
          label: '已完成修复',
          value: published.size,
          icon: 'Tools',
        },
      ],
      definitions: [
        '总体按资源版本和样本去重；异常与待复核取样本最近一次检测，覆盖全部保存版本，独立于当前筛选。',
        '已完成修复：最近一次成功应用修复的唯一样本数，不是候选数。',
        '已处理包含终结处置及审核通过待生成版本；不等于已修复。',
        '主要类型按严重度、规则优先级唯一归类；详情保留全部命中。',
        '演示库使用真实资源 ID；标签和检测证据为独立预置演示记录，未调用模型。',
      ],
    }
  },
  latest: (scope: Scope) => {
    const record = [...records.values()].reverse().find((r) => sameScope(r.result.scope, scope))
    return record ? copy(refresh(record.result.id).result) : null
  },
  history: (scope: Scope) =>
    copy(
      [...records.values()]
        .filter((r) => sameScope(r.result.scope, scope))
        .map((r) => refresh(r.result.id).result)
        .reverse(),
    ),
  result: (id: string) => copy(refresh(id).result),
  samples(id: string, q: Query) {
    const rows = refresh(id).samples.filter(
      (s) =>
        (!q.type || s.primaryType === q.type) &&
        (!q.status || s.status === q.status) &&
        (!q.keyword || `${s.id}${s.text}`.includes(q.keyword)),
    )
    return copy({
      items: rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
      total: rows.length,
      page: q.page,
      pageSize: q.pageSize,
      totalPages: Math.ceil(rows.length / q.pageSize),
    })
  },
  detail: (id: string, sampleId: string) =>
    copy(refresh(id).samples.find((s) => s.id === sampleId)!),
  mutate,
  start(scope: Scope) {
    validateResourceScope(scope)
    if (!anomalyOptions.schemes.some((s) => s.id === scope.schemeId))
      throw new Error('检测方案不存在')
    const task: Task = {
      taskId: uid('task'),
      input: copy(scope),
      status: 'running',
      createdAt: now(),
      coverage: 0,
      ruleVersion: scope.schemeId,
      modelVersion: '未调用模型 · 预置证据演示',
    }
    tasks.set(task.taskId, task)
    return copy(task)
  },
  task(id: string) {
    const task = tasks.get(id)
    if (!task) throw new Error('任务不存在')
    if (task.status === 'running' && Date.now() - Date.parse(task.createdAt) > 1200) {
      const r = createResult(task.input, id)
      task.resultId = r.id
      task.status = 'succeeded'
      task.coverage = r.validCount
    }
    return copy(task)
  },
  changeSet: (scope: Scope) => copy(getSet(scope)),
  remove(scope: Scope, candidateId: string) {
    const s = getSet(scope)
    s.entries = s.entries.filter((e) => e.candidateId !== candidateId)
    s.excluded.push(candidateId)
    s.updatedAt = now()
    return copy(getSet(scope))
  },
  check(scope: Scope): VersionCheck {
    const s = getSet(scope)
    const token = uid('validation')
    checks.set(token, { setId: s.id, fingerprint: JSON.stringify(s) })
    return {
      token,
      count: s.entries.length,
      excluded: copy(s.excluded),
      valid: !!s.entries.length && !s.conflicts,
      errors: s.entries.flatMap((e) => (e.conflict ? [e.conflict] : [])),
      targetDescription: '版本标识由版本服务分配；全部条目通过后一次性生成，原版本保持不变。',
    }
  },
  publish(scope: Scope, token: string): Published {
    const s = getSet(scope),
      check = checks.get(token)
    if (
      !check ||
      check.setId !== s.id ||
      check.fingerprint !== JSON.stringify(s) ||
      !s.entries.length ||
      s.conflicts
    )
      throw new Error('修改集已变化或存在冲突，请重新校验')
    const rows = [...records.values()].flatMap((r) => r.samples)
    const entries = s.entries.map((e) => {
      const row = rows.find((r) => r.candidates.some((c) => c.candidateId === e.candidateId))
      const c = row?.candidates.find((c) => c.candidateId === e.candidateId)
      if (
        !row ||
        !c ||
        c.status !== 'APPROVED' ||
        c.inputSampleRevisionId !== row.revisionId ||
        !c.validationResults.every((v) => v.passed)
      )
        throw new Error('候选状态或样本修订冲突，整次生成失败')
      return { row, c }
    })
    const versionId = uid('dsv')
    const snapshot = resourceVersionSamples(scope.datasetId, scope.versionId).map((r) => {
      const match = entries.find((e) => e.row.id === r.id)
      const row: Sample = match
        ? copy(match.row)
        : {
            ...copy(r),
            revisionId: `${r.versionId}:${r.id}`,
            metadata: { ...r.metadata },
            primaryType: '',
            status: '已处理',
            source: {},
            findings: [],
            candidates: [],
            timeline: [],
            actions: [],
          }
      row.versionId = versionId
      if (match) {
        row.revisionId = uid('revision')
        match.c.fieldChanges.forEach((f) => {
          row.metadata[f.field] = f.after
        })
      }
      return row
    })
    registerResourceVersion(scope.datasetId, versionId, snapshot)
    publishedSnapshots.set(versionId, snapshot)
    entries.forEach(({ row, c }) => {
      c.status = 'PUBLISHED'
      row.resolution = '已应用到新版本'
      row.timeline.push({ at: now(), message: `一次性生成版本 ${versionId}` })
    })
    s.entries = []
    s.updatedAt = now()
    checks.delete(token)
    return { newDatasetVersionId: versionId, versionLabel: versionId }
  },
}
const initialScope: Scope = {
  datasetId: 3,
  versionId: 'dsv_000003',
  language: 'zh',
  schemeId: 'anomaly-basic-v1',
}
const initial = createResult(initialScope, 'demo-anomaly-task', true)
tasks.set(initial.taskId, {
  taskId: initial.taskId,
  input: initialScope,
  status: 'succeeded',
  resultId: initial.id,
  createdAt: initial.finishedAt,
  coverage: initial.validCount,
  ruleVersion: initialScope.schemeId,
  modelVersion: '未调用模型 · 预置证据演示',
})
