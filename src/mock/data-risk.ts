import { resourceDatasets } from './resource-catalog'
import { governanceResources, resourceVersionSamples } from './governance-resources'
import type {
  Finding,
  Level,
  Options,
  Overview,
  Query,
  Result,
  ReviewInput,
  Rule,
  Sample,
  Scope,
  Task,
} from '../types/data-risk'
const copy = <T>(v: T): T => structuredClone(v)
const now = () => new Date().toISOString()
const id = (kind: string) => `${kind}_${crypto.randomUUID()}`
const rules: Rule[] = [
  {
    id: 'PII-03',
    version: '1.0',
    category: '个人信息暴露',
    name: '可关联身份信息核验',
    text: '出现账户标识及注册时间等可关联信息时，核验公开范围与授权依据。',
    conditions: '字段包含账户标识及可关联元信息；不据此直接确认违法。',
    source: '演示风险分级方案 v1.0 · 非法律结论',
  },
  {
    id: 'MIS-01',
    version: '1.0',
    category: '误导信息',
    name: '事实陈述来源核验',
    text: '对缺少可核验来源的新闻事实陈述提示核查，不直接认定虚假。',
    conditions: '新闻文本包含具体事件和时间，但当前样本未提供可核验出处。',
    source: '演示风险分级方案 v1.0 · 非事实核查结果',
  },
]
export const riskOptions: Options = {
  get datasets() {
    return governanceResources().map((d) => ({
      ...d,
      versions: d.versions.map((v) => ({ ...v, languages: v.languages.map((l) => l.code) })),
    }))
  },
  schemes: [
    {
      id: 'risk-v1',
      name: '内容语义风险分级 v1.0',
      levels: [
        {
          level: 'HIGH',
          label: '高风险',
          color: '#f34d69',
          definition: '有直接严重伤害或敏感个人信息暴露证据，优先人工核验。',
        },
        {
          level: 'MEDIUM',
          label: '中风险',
          color: '#f5a623',
          definition: '存在可关联个人信息或较明确的潜在伤害，需核查授权与上下文。',
        },
        {
          level: 'LOW',
          label: '低风险',
          color: '#1687ff',
          definition: '存在有限风险线索，结合适用条件核查。',
        },
        {
          level: 'NOTICE',
          label: '提示',
          color: '#8b5cf6',
          definition: '仅存在需补充核查的线索，不等同于已确认内容风险。',
        },
      ],
    },
  ],
  categories: ['个人信息暴露', '误导信息', '仇恨歧视', '违法有害'],
  pageSizes: [5, 10, 20],
  defaultScope: { datasetId: 3, versionId: 'dsv_000003', language: 'all', schemeId: 'risk-v1' },
  reviewStatuses: ['未发起', '待复核', '已复核'],
  actions: ['detect', 'history'],
  reviewDecisions: [
    { value: 'confirm', label: '确认建议' },
    { value: 'adjust', label: '调整等级 / 类别' },
    { value: 'exclude', label: '排除误报' },
  ],
  reviewers: ['当前复核人（演示）'],
}
const records = new Map<string, { result: Result; samples: Sample[] }>()
const tasks = new Map<string, Task>()
const same = (a: Scope, b: Scope) =>
  a.datasetId === b.datasetId &&
  a.versionId === b.versionId &&
  a.language === b.language &&
  a.schemeId === b.schemeId
function validate(scope: Scope) {
  const version = riskOptions.datasets
    .find((d) => d.id === scope.datasetId)
    ?.versions.find((v) => v.id === scope.versionId)
  if (
    !version ||
    !riskOptions.schemes.some((s) => s.id === scope.schemeId) ||
    (scope.language !== 'all' && !version.languages.includes(scope.language))
  )
    throw new Error('数据版本、语种或方案无效')
}
function record(resultId: string) {
  const r = records.get(resultId)
  if (!r) throw new Error('风险结果不存在')
  return r
}
function refresh(resultId: string) {
  const { result: r, samples } = record(resultId)
  r.riskCount = samples.length
  r.ratio = r.validCount ? (samples.length / r.validCount) * 100 : 0
  r.pendingCount = samples.filter((s) => s.status === '待复核').length
  r.reviewedCount = samples.filter((s) => s.status === '已复核').length
  r.highCount = samples.filter((s) => s.maximumSuggestedLevel === 'HIGH').length
  r.levels = riskOptions.schemes[0]!.levels.map((l) => {
    const count = samples.filter((s) => s.maximumSuggestedLevel === l.level).length
    return { ...l, count, percent: samples.length ? (count / samples.length) * 100 : 0 }
  })
  return r
}
function create(scope: Scope, taskId: string) {
  validate(scope)
  const resources = resourceVersionSamples(scope.datasetId, scope.versionId).filter(
    (s) =>
      s.datasetId === scope.datasetId &&
      s.versionId === scope.versionId &&
      (scope.language === 'all' || s.language === scope.language),
  )
  const samples: Sample[] = resources
    .filter((s) => s.text.includes('用户ID：') || s.text.includes('【新闻】'))
    .map((s) => {
      const personal = s.text.includes('用户ID：'),
        rule = rules[personal ? 0 : 1]!
      const level: Level = personal ? 'MEDIUM' : 'NOTICE'
      const evidenceId = `${s.id}:evidence`
      const finding: Finding = {
        category: rule.category,
        suggestedLevel: level,
        reason: personal
          ? '账户标识与注册时间可关联个人，需人工核验公开授权；当前证据不包含联系方式。'
          : '新闻事实陈述未附出处，仅提示核查来源，尚未确认虚假。',
        ruleId: rule.id,
        ruleVersion: rule.version,
        evidenceRefs: [evidenceId],
      }
      // 只读资源ID和正文；安全展示值在模拟服务侧遮蔽，不把敏感原值返回浏览器。
      const text = s.text.replace(/(用户ID：)\d+/, '$1[账户标识已遮蔽]')
      const sample: Sample = {
        ...s,
        text,
        revisionId: `${s.versionId}:${s.id}`,
        primaryCategory: rule.category,
        maximumSuggestedLevel: level,
        status: personal ? '待复核' : '未发起',
        findings: [finding],
        evidence: [
          {
            id: evidenceId,
            quote: text,
            feature: personal
              ? '账户标识字段 + 注册时间；标识值受控遮蔽'
              : '新闻事件与时间；当前未附来源',
          },
        ],
        rules: [copy(rule)],
        cases: [
          {
            id: `${rule.id}:case`,
            ruleId: rule.id,
            ruleVersion: rule.version,
            title: personal ? '账户元信息公开授权核查（演示）' : '新闻来源补充核查（演示）',
            text: personal
              ? '复核公开范围与授权记录；缺少授权证据时继续核查，不直接认定违法。'
              : '补充权威原始出处并核对事件上下文；来源缺失不等于信息虚假。',
          },
        ],
        actions: personal ? ['viewReview'] : ['createReview'],
      }
      if (personal)
        sample.review = {
          id: id('risk-review'),
          status: '待复核',
          originalFindings: copy(sample.findings),
          opinion: '',
          reviewer: riskOptions.reviewers[0]!,
          updatedAt: now(),
          actions: ['confirm', 'adjust', 'exclude'],
        }
      return sample
    })
  // 优先呈现已有待复核工单。
  samples.sort((a, b) => Number(b.status === '待复核') - Number(a.status === '待复核'))
  const result: Result = {
    id: id('risk-result'),
    taskId,
    scope: copy(scope),
    datasetName: resourceDatasets.find((d) => d.id === scope.datasetId)!.name,
    finishedAt: now(),
    status: '已完成',
    validCount: resources.length,
    riskCount: 0,
    ratio: 0,
    highCount: 0,
    pendingCount: 0,
    reviewedCount: 0,
    unassessableCount: 0,
    failedCount: 0,
    levels: [],
    actions: ['export', 'viewTask'],
  }
  records.set(result.id, { result, samples })
  refresh(result.id)
  return result
}
function detail(resultId: string, sampleId: string) {
  const s = record(resultId).samples.find((s) => s.id === sampleId)
  if (!s) throw new Error('样本不属于当前结果')
  return s
}
function matching(resultId: string, q: Query) {
  const matches = record(resultId).samples.filter(
    (s) =>
      (!q.level || s.maximumSuggestedLevel === q.level) &&
      (!q.status || s.status === q.status) &&
      `${s.id} ${s.text} ${s.primaryCategory}`
        .toLowerCase()
        .includes(q.keyword.trim().toLowerCase()),
  )
  if (!q.sortBy || !q.sortOrder) return matches
  const levelOrder = { HIGH: 0, MEDIUM: 1, LOW: 2, NOTICE: 3 }
  const statusOrder: Record<string, number> = { 待复核: 0, 已复核: 1, 未发起: 2 }
  const direction = q.sortOrder === 'asc' ? 1 : -1
  return matches.sort((a, b) => {
    const comparison =
      q.sortBy === 'maximumSuggestedLevel'
        ? levelOrder[a.maximumSuggestedLevel] - levelOrder[b.maximumSuggestedLevel]
        : (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99) ||
          a.status.localeCompare(b.status, 'zh-CN')
    return comparison ? comparison * direction : a.id.localeCompare(b.id)
  })
}
export const riskMock = {
  options: () => copy(riskOptions),
  latest: (scope: Scope) =>
    copy([...records.values()].reverse().find((r) => same(r.result.scope, scope))?.result || null),
  result: (resultId: string) => copy(refresh(resultId)),
  history: (scope: Scope) =>
    copy(
      [...records.values()]
        .reverse()
        .filter((r) => same(r.result.scope, scope))
        .map((r) => r.result),
    ),
  samples: (resultId: string, q: Query) => {
    const all = matching(resultId, q)
    return copy({
      items: all.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
      total: all.length,
      page: q.page,
      pageSize: q.pageSize,
      totalPages: Math.ceil(all.length / q.pageSize),
    })
  },
  detail: (resultId: string, sampleId: string) => copy(detail(resultId, sampleId)),
  export: (resultId: string, q: Query) => copy(matching(resultId, q)),
  start: (scope: Scope) => {
    validate(scope)
    const t: Task = { id: id('risk-task'), input: copy(scope), status: 'running', createdAt: now() }
    tasks.set(t.id, t)
    return copy(t)
  },
  task: (taskId: string) => {
    const t = tasks.get(taskId)
    if (!t) throw new Error('任务不存在')
    if (t.status === 'running') {
      t.resultId = create(t.input, t.id).id
      t.status = 'succeeded'
    }
    return copy(t)
  },
  review: (
    resultId: string,
    sampleId: string,
    revisionId: string,
    input: ReviewInput,
    reviewId?: string,
  ) => {
    const s = detail(resultId, sampleId)
    if (s.revisionId !== revisionId) throw new Error('样本修订不一致，请刷新')
    if (!input.opinion.trim()) throw new Error('请填写复核意见')
    if (!riskOptions.reviewers.includes(input.reviewer)) throw new Error('无权指定此复核人')
    if (!reviewId) {
      if (s.review) return copy(s) // 结果+样本唯一约束：幂等复用工单。
      s.review = {
        id: id('risk-review'),
        status: '待复核',
        originalFindings: copy(s.findings),
        opinion: input.opinion.trim(),
        reviewer: input.reviewer,
        updatedAt: now(),
        actions: ['confirm', 'adjust', 'exclude'],
      }
      s.status = '待复核'
      s.actions = ['viewReview']
    } else {
      if (!s.review || s.review.id !== reviewId || !s.review.actions.includes(input.decision))
        throw new Error('工单已更新或无复核权限')
      if (
        !riskOptions.schemes[0]!.levels.some((l) => l.level === input.level) ||
        !riskOptions.categories.includes(input.category)
      )
        throw new Error('等级或类别无效')
      Object.assign(s.review, {
        status: '已复核',
        opinion: input.opinion.trim(),
        reviewer: input.reviewer,
        decision: input.decision,
        level:
          input.decision === 'exclude'
            ? undefined
            : input.decision === 'confirm'
              ? s.maximumSuggestedLevel
              : input.level,
        category:
          input.decision === 'exclude'
            ? undefined
            : input.decision === 'confirm'
              ? s.primaryCategory
              : input.category,
        updatedAt: now(),
        actions: [],
      })
      s.status = '已复核'
    }
    refresh(resultId)
    return copy(s)
  },
  knowledge: (resultId: string, sampleId: string, keyword: string) =>
    copy(
      detail(resultId, sampleId).rules.filter((r) =>
        `${r.name}${r.category}${r.text}`.includes(keyword.trim()),
      ),
    ),
  overview: (): Overview => {
    // 各资源固定版本只纳入最新的全语种结果，重复检测不重复计数。
    const included = resourceDatasets
      .map((d) =>
        [...records.values()]
          .reverse()
          .find(
            (r) =>
              r.result.scope.datasetId === d.id &&
              r.result.scope.versionId === d.versionId &&
              r.result.scope.language === 'all',
          )!,
      )
      .filter(Boolean)
    const sum = (key: 'validCount' | 'riskCount' | 'highCount' | 'pendingCount') =>
      included.reduce((n, r) => n + r.result[key], 0)
    return copy({
      cards: [
        { label: '已检测样本', value: sum('validCount'), icon: 'Document' },
        { label: '风险候选样本', value: sum('riskCount'), icon: 'WarningFilled' },
        { label: '高风险样本', value: sum('highCount'), icon: 'Shield' },
        { label: '待人工复核', value: sum('pendingCount'), icon: 'UserFilled' },
      ],
      definitions: [
        '演示数据：统计来自完整资源样本集合，非参考图的规模占位数。',
        '每个数据集固定版本只纳入最新全语种结果，按样本最高建议等级去重。',
        '风险候选包含待核查线索；未复核不等于确认违法，人工结论不覆盖检测等级。',
      ],
      records: included.map(({ result: r }) => ({
        resultId: r.id,
        datasetName: r.datasetName,
        versionId: r.scope.versionId,
        validCount: r.validCount,
        riskCount: r.riskCount,
        finishedAt: r.finishedAt,
      })),
    })
  },
}
for (const d of resourceDatasets) {
  const scope = { datasetId: d.id, versionId: d.versionId, language: 'all', schemeId: 'risk-v1' }
  const task = riskMock.start(scope)
  riskMock.task(task.id)
}
