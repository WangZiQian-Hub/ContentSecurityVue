import { beforeEach, describe, expect, it, vi } from 'vitest'
const backend = vi.hoisted(() => ({ isMock: true, request: vi.fn() }))
vi.mock('./request', () => backend)
vi.mock('./governance-llm', () => ({ isGovernanceLlm: false, llmRequest: vi.fn() }))
vi.mock('./governance-llm', () => ({ isGovernanceLlm: false, llmRequest: vi.fn() }))
import * as api from './data-risk'
import { getResourceSamples } from './data-resource'
import { getLatestValueResult, listValueSamples } from './data-value'
import { resourceSamples } from '../mock/resource-samples'
import type { ReviewInput } from '../types/data-risk'
const scope = { datasetId: 3, versionId: 'dsv_000003', language: 'all', schemeId: 'risk-v1' }
const q = { page: 1, pageSize: 1, keyword: '', level: '', status: '' }
const input: ReviewInput = {
  opinion: '经核查授权情况，调整建议等级供后续治理参考。',
  reviewer: '当前复核人（演示）',
  decision: 'adjust',
  category: '个人信息暴露',
  level: 'LOW',
}
describe('风险识别：资源一致性与保存结果契约', () => {
  beforeEach(() => {
    backend.isMock = true
    backend.request.mockReset()
  })
  it('跨页ID与资源版本一致，遮蔽值仍保留字段证据；完整分页和导出守恒', async () => {
    const r = (await api.getLatestRisk(scope))!
    const all = await api.exportRiskSamples(r.id, q)
    const resources = await getResourceSamples(
      scope.datasetId,
      scope.versionId,
      all.map((s) => s.id),
    )
    const value = (await getLatestValueResult({ ...scope, schemeId: 'general-v1' }))!
    const valueRows = await listValueSamples(value.id, {
      page: 1,
      pageSize: 200,
      keyword: '',
      tier: 'all',
      bin: '',
    })
    expect(r.validCount).toBe(resourceSamples.filter((s) => s.datasetId === scope.datasetId).length)
    expect(all).toHaveLength(r.riskCount)
    expect(all.length).toBeGreaterThan(q.pageSize)
    const first = await api.listRiskSamples(r.id, q)
    const second = await api.listRiskSamples(r.id, { ...q, page: 2 })
    expect([...first.items, ...second.items].map((s) => s.id)).toEqual(all.map((s) => s.id))
    for (const s of all) {
      const source = resources.find((x) => x.id === s.id)!
      expect(s.versionId).toBe(source.versionId)
      expect(valueRows.items.some((v) => v.id === s.id)).toBe(true)
      expect(s.text).toBe(source.text.replace(/(用户ID：)\d+/, '$1[账户标识已遮蔽]'))
      for (const f of s.findings) {
        expect(s.rules.some((rule) => rule.id === f.ruleId && rule.version === f.ruleVersion)).toBe(
          true,
        )
        expect(
          f.evidenceRefs.every((id) =>
            s.evidence.some((e) => e.id === id && s.text.includes(e.quote)),
          ),
        ).toBe(true)
        expect(s.cases.every((c) => c.ruleId === f.ruleId && c.ruleVersion === f.ruleVersion)).toBe(
          true,
        )
      }
    }
    expect(JSON.stringify(all)).not.toContain('10086')
    expect((await api.exportRiskSamples(r.id, { ...q, keyword: all[0]!.id })).length).toBe(1)
  })
  it('分布互斥且与筛选列表同源；总体只纳入最新全语种结果', async () => {
    const r = (await api.getLatestRisk(scope))!
    expect(r.levels.reduce((n, l) => n + l.count, 0)).toBe(r.riskCount)
    expect(r.ratio).toBe((r.riskCount / r.validCount) * 100)
    for (const level of r.levels)
      expect((await api.listRiskSamples(r.id, { ...q, level: level.level })).total).toBe(
        level.count,
      )
    const overview = await api.getRiskOverview()
    expect(overview.cards[0]!.value).toBe(overview.records.reduce((n, r) => n + r.validCount, 0))
    const t = await api.startRisk(scope)
    expect(t.status).toBe('running')
    expect(t.resultId).toBeUndefined()
    const saved = await api.getRiskTask(t.id)
    expect(saved.status).toBe('succeeded')
    expect((await api.getRiskOverview()).cards).toEqual(overview.cards)
    expect((await api.getRiskHistory(scope))[0]!.id).toBe(saved.resultId)
  })
  it('条件严格匹配；无风险结果不能复用旧样本', async () => {
    expect(await api.getLatestRisk({ ...scope, language: 'en' })).toBeNull()
    const t = await api.startRisk({ ...scope, language: 'en' })
    const done = await api.getRiskTask(t.id)
    const r = await api.getRiskResult(done.resultId!)
    expect(r.validCount).toBeGreaterThan(0)
    expect(r.riskCount).toBe(0)
    expect((await api.listRiskSamples(r.id, q)).items).toEqual([])
    await expect(api.startRisk({ ...scope, versionId: 'wrong-version' })).rejects.toThrow()
  })
  it('已有工单幂等复用；必须填意见；人工调整不覆盖原等级、原证据或原资源', async () => {
    const r = (await api.getLatestRisk(scope))!
    const all = await api.exportRiskSamples(r.id, q)
    const row = all.find((s) => s.review)!
    const oldResource = structuredClone(resourceSamples)
    expect(row.actions).toContain('viewReview')
    expect(row.actions).not.toContain('createReview')
    const repeated = await api.reviewRisk(r.id, row.id, row.revisionId, input)
    expect(repeated.review?.id).toBe(row.review?.id)
    await expect(
      api.reviewRisk(r.id, row.id, row.revisionId, { ...input, opinion: '  ' }, row.review!.id),
    ).rejects.toThrow()
    await expect(api.reviewRisk(r.id, row.id, 'stale', input, row.review!.id)).rejects.toThrow()
    const adjusted = await api.reviewRisk(r.id, row.id, row.revisionId, input, row.review!.id)
    expect(adjusted.review?.level).toBe('LOW')
    expect(adjusted.maximumSuggestedLevel).toBe(row.maximumSuggestedLevel)
    expect(adjusted.review?.originalFindings).toEqual(row.findings)
    expect(adjusted.findings).toEqual(row.findings)
    expect((await api.getRiskResult(r.id)).levels).toEqual(r.levels)
    expect(resourceSamples).toEqual(oldResource)
    await expect(
      api.reviewRisk(r.id, row.id, row.revisionId, input, row.review!.id),
    ).rejects.toThrow()
    const other = all.find((s) => !s.review)!
    const created = await api.reviewRisk(r.id, other.id, other.revisionId, input)
    const again = await api.reviewRisk(r.id, other.id, other.revisionId, input)
    expect(created.review?.id).toBe(again.review?.id)
    const excluded = await api.reviewRisk(
      r.id,
      other.id,
      other.revisionId,
      { ...input, decision: 'exclude' },
      created.review!.id,
    )
    expect(excluded.review?.level).toBeUndefined()
    expect(excluded.maximumSuggestedLevel).toBe(other.maximumSuggestedLevel)
    expect((await api.getRiskResult(r.id)).riskCount).toBe(r.riskCount)
  })
  it('真实适配读取保存详情，检索不触发模型；导出不携带分页窗口', async () => {
    backend.isMock = false
    backend.request.mockResolvedValueOnce({
      taskId: 'server-task',
      status: 'running',
      input: scope,
      createdAt: '2026-09-26T10:00:00Z',
    })
    expect((await api.startRisk(scope)).id).toBe('server-task')
    expect(backend.request).toHaveBeenLastCalledWith({
      url: '/data-governance/risk-tasks',
      method: 'POST',
      data: { kind: 'governance-risk', name: '内容风险识别与分级', input: scope },
    })
    await api.getRiskSample('result', 'sample')
    expect(backend.request).toHaveBeenLastCalledWith({
      url: '/data-governance/risk-results/result/samples/sample',
    })
    await api.searchRiskKnowledge('result', 'sample', '个人信息暴露')
    expect(backend.request).toHaveBeenLastCalledWith({
      url: '/risk-knowledge',
      params: { resultId: 'result', sampleId: 'sample', keyword: '个人信息暴露' },
    })
    await api.exportRiskSamples('result', { ...q, page: 10 })
    expect(backend.request).toHaveBeenLastCalledWith({
      url: '/data-governance/risk-results/result/export',
      method: 'POST',
      data: { keyword: '', level: '', status: '' },
    })
    await api.reviewRisk('result', 'sample', 'revision', input, 'review')
    expect(backend.request).toHaveBeenLastCalledWith({
      url: '/data-governance/risk-results/result/samples/sample/reviews',
      method: 'POST',
      data: { inputSampleRevisionId: 'revision', reviewId: 'review', ...input },
    })
  })
  it('准确率 Mock 按完整批次统计、按样本数汇总，重复检测不重复累计', async () => {
    const overview = await api.getRiskOverview()
    const metrics = await Promise.all(
      overview.records.map((r) => api.getRiskResultWeightAccuracy(r.resultId)),
    )
    for (const [index, metric] of metrics.entries()) {
      expect(metric.totalCount).toBe(overview.records[index]!.validCount)
      expect(metric.correctCount).toBeLessThanOrEqual(metric.totalCount)
      expect(metric.accuracyPercent).toBe(
        Math.round((metric.correctCount / metric.totalCount) * 1000) / 10,
      )
    }
    const overall = await api.getRiskWeightAccuracyOverview()
    const correct = metrics.reduce((n, m) => n + m.correctCount, 0)
    const total = metrics.reduce((n, m) => n + m.totalCount, 0)
    expect(overall).toEqual({
      correctCount: correct,
      totalCount: total,
      accuracyPercent: Math.round((correct / total) * 1000) / 10,
    })
    const previous = (await api.getLatestRisk(scope))!
    const previousAccuracy = await api.getRiskResultWeightAccuracy(previous.id)
    const task = await api.startRisk(scope)
    const done = await api.getRiskTask(task.id)
    expect(await api.getRiskResultWeightAccuracy(done.resultId!)).toEqual(previousAccuracy)
    expect(await api.getRiskResultWeightAccuracy(previous.id)).toEqual(previousAccuracy)
    expect(await api.getRiskWeightAccuracyOverview()).toEqual(overall)
    // 单语种检测可查询批次准确率，但不能与全语种结果重复纳入总体。
    const localized = await api.startRisk({ ...scope, language: 'en' })
    const localizedDone = await api.getRiskTask(localized.id)
    const localizedResult = await api.getRiskResult(localizedDone.resultId!)
    expect((await api.getRiskResultWeightAccuracy(localizedResult.id)).totalCount).toBe(
      localizedResult.validCount,
    )
    expect(await api.getRiskWeightAccuracyOverview()).toEqual(overall)
    await expect(api.getRiskResultWeightAccuracy('missing')).rejects.toThrow('风险结果不存在')
  })
  it('准确率使用两个独立查询路径，总体携带 kind，批次 ID 安全编码', async () => {
    backend.isMock = false
    const metric = { accuracyPercent: 92.3, correctCount: 923, totalCount: 1000 }
    backend.request.mockResolvedValue(metric)
    expect(await api.getRiskWeightAccuracyOverview()).toEqual(metric)
    expect(backend.request).toHaveBeenLastCalledWith({
      url: '/data-governance/risk-weight-accuracy/overview',
      params: { kind: 'governance-risk' },
    })
    expect(await api.getRiskResultWeightAccuracy('result/a b')).toEqual(metric)
    expect(backend.request).toHaveBeenLastCalledWith({
      url: '/data-governance/risk-results/result%2Fa%20b/weight-accuracy',
    })
  })
})
