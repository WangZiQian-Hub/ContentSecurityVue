import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useComplianceStore, validateAudit } from './compliance'
import {
  createComplianceDemo,
  demoRefs,
  demoNeuron,
  demoTrace,
  demoLineage,
} from '../mock/compliance'
import type { ComplianceContext, Overview } from '../types/compliance'

beforeEach(() => {
  vi.stubEnv('VITE_COMPLIANCE_DEMO', 'false')
  setActivePinia(createPinia())
})
const query = { scope: 'all', from: '2026-09-21T00:00:00+08:00', to: '2026-09-28T00:00:00+08:00' }
describe('compliance evidence and context safety', () => {
  it('keeps design counts, matrix coordinates and the same CP-12 gap consistent', async () => {
    const api = createComplianceDemo(),
      overview = await api.overview(query)
    expect(overview.handoffs.reduce((n, h) => n + h.expectedCount!, 0)).toBe(308)
    expect(overview.handoffs.reduce((n, h) => n + h.missingCount!, 0)).toBe(7)
    expect(demoLineage.edges.filter((e) => e.verificationState === 'missing')).toHaveLength(1)
    expect(demoTrace.records).toHaveLength(8)
    expect(demoTrace.checks.find((c) => c.key === 'version')?.state).toBe('missing')
    expect(
      demoTrace.records
        .filter((r) => r.recordScope === 'provenance')
        .every((r) => r.sourceTraceId !== demoTrace.currentTraceId),
    ).toBe(true)
    expect(demoNeuron.heatmap.flat().filter((v) => v !== null && Math.abs(v) >= 2.5)).toHaveLength(
      3,
    )
    for (const item of demoNeuron.abnormalNeurons)
      expect(
        demoNeuron.heatmap[demoNeuron.layerIndices.indexOf(item.layer)]![
          demoNeuron.neuronIndices.indexOf(item.index)
        ],
      ).toBe(item.value)
  })
  it('resolves training, model and ModelCall IDs explicitly; rejects conflicts and unknown IDs', async () => {
    const api = createComplianceDemo()
    expect(
      (await api.contexts({ sourceKind: 'training_task', sourceId: demoRefs.training })).subjectRef
        ?.entityId,
    ).toBe(demoRefs.training)
    expect(
      (await api.contexts({ sourceKind: 'model', sourceId: demoRefs.model })).modelVersion,
    ).toBe('v1.4.0')
    const call = await api.contexts({
      sourceKind: 'model_call',
      sourceId: demoRefs.call,
      traceId: demoRefs.trace,
    })
    expect(call.taskId).not.toBe(demoRefs.call)
    expect(
      (await api.contexts({ sourceKind: 'model_call', sourceId: demoRefs.call, traceId: 'wrong' }))
        .resolution,
    ).toBe('conflict')
    expect((await api.contexts({ sourceKind: 'task', sourceId: demoRefs.call })).resolution).toBe(
      'not_found',
    )
    expect((await api.contexts({ sourceKind: 'model', sourceId: 'unknown' })).resolution).toBe(
      'not_found',
    )
    expect((await api.contexts({ sourceKind: 'model', sourceId: 'mdl-2' })).resolution).toBe(
      'ambiguous',
    )
  })
  it('does not invent audit/capture results for existing training/model fixtures', async () => {
    const store = useComplianceStore()
    store.setTestApi(createComplianceDemo())
    await store.loadContext(
      { sourceKind: 'training_task', sourceId: 'TR-0925-012' },
      'training_monitor',
    )
    expect(store.context?.resolution).toBe('resolved')
    expect(store.audit).toBeNull()
    await store.loadContext({ sourceKind: 'model', sourceId: 'mdl-2' }, 'neuron_audit', {
      versionId: 'v1.5.0',
    })
    expect(store.audit).toBeNull()
  })
  it('switches capability queries independently and never executes on reads', async () => {
    const store = useComplianceStore(),
      api = createComplianceDemo(),
      execute = vi.spyOn(api, 'execute')
    store.setTestApi(api)
    await store.loadContext(
      { sourceKind: 'training_task', sourceId: demoRefs.training },
      'training_monitor',
    )
    expect(store.audit?.result.kind).toBe('training_monitor')
    await store.loadContext(
      { sourceKind: 'model_call', sourceId: demoRefs.call },
      'reasoning_audit',
    )
    expect(store.audit?.result.kind).toBe('reasoning_audit')
    await store.loadContext({ sourceKind: 'model', sourceId: demoRefs.model }, 'neuron_audit')
    expect(store.audit?.result.kind).toBe('neuron_audit')
    expect(execute).not.toHaveBeenCalled()
  })
  it('does not overwrite a newer selection with a slow context response', async () => {
    const store = useComplianceStore(),
      api = createComplianceDemo()
    let finish!: (result: ComplianceContext) => void
    const slow = new Promise<ComplianceContext>((resolve) => (finish = resolve)),
      original = api.contexts
    api.contexts = vi
      .fn()
      .mockImplementationOnce(() => slow)
      .mockImplementation(original)
    store.setTestApi(api)
    const first = store.loadContext(
      { sourceKind: 'model_call', sourceId: demoRefs.call },
      'reasoning_audit',
    )
    await store.loadContext(
      { sourceKind: 'training_task', sourceId: demoRefs.training },
      'training_monitor',
    )
    finish(await original({ sourceKind: 'model_call', sourceId: demoRefs.call }))
    await first
    expect(store.audit?.result.kind).toBe('training_monitor')
  })
  it('preserves a real HTTP failure and never falls back to demo success', async () => {
    const store = useComplianceStore(),
      api = createComplianceDemo()
    api.overview = vi.fn().mockRejectedValue(new Error('502 upstream unavailable'))
    api.audits = vi.fn().mockRejectedValue(new Error('403 forbidden'))
    store.setTestApi(api)
    await store.loadOverview(query)
    expect(store.overview).toBeNull()
    expect(store.error).toContain('502')
    expect(store.error).toContain('403')
  })
  it('ignores late overview completion after leaving the page', async () => {
    const store = useComplianceStore(),
      api = createComplianceDemo()
    let finish!: (result: Overview) => void
    const result = await api.overview(query)
    api.overview = () => new Promise((resolve) => (finish = resolve))
    store.setTestApi(api)
    const pending = store.loadOverview(query)
    store.invalidate()
    finish(result)
    await pending
    expect(store.overview).toBeNull()
  })
  it('reloads actual alert after failed close and does not mark it resolved', async () => {
    const store = useComplianceStore(),
      api = createComplianceDemo()
    store.setTestApi(api)
    await store.selectAlert(demoRefs.alert)
    expect(await store.act('claim', {}, 'claim-id')).toBe(true)
    expect(
      await store.act('resolve', { reviewConclusion: 'checked', evidenceRefs: [] }, 'close-id'),
    ).toBe(false)
    expect(store.alert?.currentStatus).toBe('processing')
    expect(store.actionError).toContain('不能关闭')
    await expect(
      api.alertAction(demoRefs.alert, 'claim', { expectedVersion: 3 }, 'stale-id'),
    ).rejects.toThrow('版本冲突')
  })
  it('executes full-chain audit with the resolved task ID, never raw trace/ModelCall ID', async () => {
    const store = useComplianceStore(),
      api = createComplianceDemo()
    api.execute = vi.fn().mockResolvedValue({ taskId: 'audit-task', status: 'succeeded' })
    store.setTestApi(api)
    await store.loadContext({
      sourceKind: 'model_call',
      sourceId: demoRefs.call,
      traceId: demoRefs.trace,
    })
    await store.execute('full_chain_audit')
    expect(api.execute).toHaveBeenCalledWith(
      'full_chain_audit',
      { taskId: 'demo_task_call_9081' },
      expect.any(String),
    )
  })
  it('keeps every trace source evidence bound to its exact stage subject and original trace', async () => {
    const api = createComplianceDemo()
    for (const record of demoTrace.records) {
      const evidence = await api.evidence(record.evidenceRefs[0]!)
      expect(evidence.subjectRef.entityId).toBe(record.subjectRef.entityId)
      expect(evidence.sourceTraceId).toBe(record.sourceTraceId)
    }
  })
  it('keeps overview queue and action counts in the same scope and date range', async () => {
    const store = useComplianceStore()
    store.setTestApi(createComplianceDemo())
    await store.loadOverview({ ...query, scope: 'training' })
    expect(store.overview?.pendingReviewsCount).toBe(0)
    expect(store.audits?.total).toBe(0)
  })
  it('requires explicit capture choice when a model version has multiple captures', async () => {
    const store = useComplianceStore(),
      api = createComplianceDemo()
    const context = await api.contexts({ sourceKind: 'model', sourceId: demoRefs.model })
    const second = { ...context.candidates[0]!, captureId: 'another-capture' }
    api.contexts = vi.fn().mockResolvedValue({
      ...context,
      resolution: 'ambiguous',
      subjectRef: null,
      captureId: null,
      candidates: [...context.candidates, second],
    })
    const list = vi.spyOn(api, 'audits')
    store.setTestApi(api)
    await store.loadContext({ sourceKind: 'model', sourceId: demoRefs.model }, 'neuron_audit', {
      versionId: 'v1.4.0',
    })
    expect(store.audit).toBeNull()
    expect(list).not.toHaveBeenCalled()
    await store.loadContext({ sourceKind: 'model', sourceId: demoRefs.model }, 'neuron_audit', {
      versionId: 'v1.4.0',
      captureId: demoRefs.capture,
    })
    expect(store.audit?.result.kind).toBe('neuron_audit')
  })
  it('rejects a mismatched returned capture and preserves an unavailable result without inventing a matrix', async () => {
    const api = createComplianceDemo(),
      detail = await api.audit('demo_audit_0431')
    const context = await api.contexts({ sourceKind: 'model', sourceId: demoRefs.model })
    const scope = {
      capabilityCode: 'neuron_audit' as const,
      subjectType: 'model',
      subjectId: demoRefs.model,
      versionId: 'v1.4.0',
      captureId: demoRefs.capture,
      page: 1,
      pageSize: 20,
    }
    expect(() =>
      validateAudit({ ...detail, result: { ...demoNeuron, captureId: 'other' } }, scope, context),
    ).toThrow('捕获记录')
    const unavailable = {
      ...detail,
      result: {
        ...demoNeuron,
        availability: 'unavailable' as const,
        captureId: null,
        heatmap: [],
        abnormalNeurons: [],
        observedCount: 0,
        ratio: null,
      },
    }
    expect(() => validateAudit(unavailable, scope, context)).not.toThrow()
    expect(unavailable.result.heatmap).toEqual([])
  })
  it('cancels task polling on page leave without issuing another execute POST', async () => {
    vi.useFakeTimers()
    try {
      const store = useComplianceStore(),
        api = createComplianceDemo()
      api.execute = vi.fn().mockResolvedValue({ taskId: 'running-audit', status: 'running' })
      api.task = vi.fn().mockResolvedValue({ taskId: 'running-audit', status: 'running' })
      store.setTestApi(api)
      await store.loadContext({ sourceKind: 'model_call', sourceId: demoRefs.call })
      await store.execute('full_chain_audit')
      await vi.advanceTimersByTimeAsync(2000)
      expect(api.task).toHaveBeenCalledTimes(1)
      store.invalidate()
      await vi.advanceTimersByTimeAsync(5000)
      expect(api.task).toHaveBeenCalledTimes(1)
      expect(api.execute).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
