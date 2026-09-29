import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { complianceApi, type ComplianceApi } from '../api/compliance'
import { createComplianceDemo } from '../mock/compliance'
import type * as C from '../types/compliance'

export function describeError(error: unknown) {
  const value = error as {
    response?: { status?: number; data?: { message?: string } }
    message?: string
  }
  const status = value?.response?.status
  return `${status === 403 ? '无权限：' : status === 404 ? '未找到：' : status === 409 ? '版本冲突：' : ''}${value?.response?.data?.message || value?.message || '请求失败，请重试'}`
}
export function validateAudit(
  detail: C.AuditDetail,
  scope: C.AuditQuery,
  context: C.ComplianceContext | null,
) {
  if (
    detail.capabilityCode !== scope.capabilityCode ||
    detail.subjectRef.entityType !== scope.subjectType ||
    String(detail.subjectRef.entityId) !== String(scope.subjectId)
  )
    throw new Error('审计结果主体或能力与查询对象不匹配')
  if (scope.versionId && detail.subjectRef.versionId !== scope.versionId)
    throw new Error('审计结果版本与查询版本不匹配')
  if (detail.result.kind === 'neuron_audit' && detail.result.availability === 'available') {
    const expectedVersion = scope.versionId || context?.modelVersion,
      expectedCapture = scope.captureId || context?.captureId
    if (
      !expectedVersion ||
      !expectedCapture ||
      detail.result.modelVersion !== expectedVersion ||
      detail.result.captureId !== expectedCapture ||
      (context?.inferenceId && detail.result.inferenceId !== context.inferenceId)
    )
      throw new Error('捕获记录或精确模型版本不匹配，未展示激活矩阵')
  }
}
export const useComplianceStore = defineStore('compliance', () => {
  const demo = ref(
    import.meta.env.VITE_COMPLIANCE_DEMO === 'true' ||
      (import.meta.env.DEV && import.meta.env.VITE_COMPLIANCE_DEMO !== 'false' && import.meta.env.VITE_USE_MOCK !== 'false'),
  )
  let demoApi = createComplianceDemo()
  let override: ComplianceApi | undefined
  const api = () => override || (demo.value ? demoApi : complianceApi)
  const loading = ref(false),
    error = ref(''),
    busy = ref(false),
    actionError = ref('')
  const overview = shallowRef<C.Overview | null>(null),
    lineage = shallowRef<C.Lineage | null>(null)
  const audits = shallowRef<C.CompliancePage<C.AuditSummary> | null>(null),
    audit = shallowRef<C.AuditDetail | null>(null)
  const context = shallowRef<C.ComplianceContext | null>(null),
    trace = shallowRef<C.TraceResult | null>(null)
  const alerts = shallowRef<C.CompliancePage<C.AlertSummary> | null>(null),
    alert = shallowRef<C.AlertDetail | null>(null)
  const evidence = shallowRef<C.Evidence | null>(null),
    evidenceError = ref(''),
    evidenceLoading = ref(false)
  const task = shallowRef<C.ComplianceTask | null>(null)
  let auditScope: C.AuditQuery | undefined
  const candidates = shallowRef<C.ContextCandidate[]>([])
  let candidateGeneration = 0
  async function loadCandidates(sourceKind: string) {
    const current = ++candidateGeneration
    candidates.value = []
    try {
      const result = await api().contexts({ sourceKind })
      if (current === candidateGeneration) candidates.value = result.candidates
    } catch (exception) {
      if (current === candidateGeneration) error.value = describeError(exception)
    }
  }
  let generation = 0,
    evidenceGeneration = 0,
    alertGeneration = 0
  let controller: AbortController | undefined, evidenceController: AbortController | undefined
  let pollTimer: ReturnType<typeof setTimeout> | undefined
  function stop() {
    generation++
    alertGeneration++
    controller?.abort()
    clearTimeout(pollTimer)
    loading.value = false
  }
  function clear() {
    auditScope = undefined
    overview.value = null
    lineage.value = null
    audits.value = null
    audit.value = null
    context.value = null
    trace.value = null
    alerts.value = null
    alert.value = null
    task.value = null
    error.value = ''
    actionError.value = ''
  }
  function invalidate() {
    candidateGeneration++
    stop()
    clear()
    closeEvidence()
  }
  function setDemo(value: boolean) {
    invalidate()
    demo.value = value
    demoApi = createComplianceDemo()
  }
  async function load(
    operation: (
      client: ComplianceApi,
      signal: AbortSignal,
      isCurrent: () => boolean,
    ) => Promise<void>,
  ) {
    stop()
    clear()
    const current = generation
    controller = new AbortController()
    loading.value = true
    const isCurrent = () => current === generation
    try {
      await operation(api(), controller.signal, isCurrent)
    } catch (exception) {
      if (isCurrent()) error.value = describeError(exception)
    } finally {
      if (isCurrent()) loading.value = false
    }
  }
  async function loadOverview(query: C.OverviewQuery, page = 1) {
    await load(async (client, signal, current) => {
      const results = await Promise.allSettled([
        client.overview(query, signal),
        client.audits({ ...query, reviewStatus: 'pending', page, pageSize: 5 }, signal),
      ])
      if (!current()) return
      if (results[0].status === 'fulfilled') overview.value = results[0].value
      else error.value = describeError(results[0].reason)
      if (results[1].status === 'fulfilled') audits.value = results[1].value
      else error.value += ` 待复核队列：${describeError(results[1].reason)}`
    })
  }
  async function loadLineage(query: C.LineageQuery) {
    await load(async (client, signal, current) => {
      const result = await client.lineage(query, signal)
      if (current()) lineage.value = result
    })
  }
  async function loadContext(
    query: C.ContextQuery,
    capability?: C.Capability,
    selection?: { versionId?: string; captureId?: string },
  ) {
    await load(async (client, signal, current) => {
      const resolved = await client.contexts(query, signal)
      if (!current()) return
      context.value = resolved
      if (resolved.resolution === 'conflict' || resolved.resolution === 'not_found') return
      // Explicit candidate selection may disambiguate version; never select the first result.
      const matchingCandidates = selection?.versionId
        ? resolved.candidates.filter(
            (c) =>
              c.modelVersion === selection.versionId &&
              (!selection.captureId || c.captureId === selection.captureId),
          )
        : []
      const candidate = matchingCandidates.length === 1 ? matchingCandidates[0] : undefined
      if (resolved.resolution === 'ambiguous' && !candidate) return
      const subject =
        candidate?.subjectRef || (resolved.resolution === 'resolved' ? resolved.subjectRef : null)
      if (!subject) return
      if (candidate)
        context.value = {
          ...resolved,
          resolution: 'resolved',
          subjectRef: candidate.subjectRef,
          modelVersion: candidate.modelVersion,
          captureId: candidate.captureId,
        }
      if (!capability) {
        if (resolved.traceId) {
          const result = await client.trace(resolved.traceId, signal)
          if (current()) trace.value = result
        }
        return
      }
      auditScope = {
        capabilityCode: capability,
        subjectType: subject.entityType,
        subjectId: subject.entityId,
        versionId: selection?.versionId || subject.versionId || undefined,
        captureId:
          capability === 'neuron_audit'
            ? selection?.captureId || candidate?.captureId || resolved.captureId || undefined
            : undefined,
        page: 1,
        pageSize: 20,
      }
      const list = await client.audits(auditScope, signal)
      if (!current()) return
      audits.value = list
      if (list.total === 1 && list.items.length === 1) {
        const detail = await client.audit(list.items[0]!.id, signal)
        if (current()) {
          validateAudit(detail, auditScope!, context.value)
          audit.value = detail
        }
      }
      if (capability === 'training_monitor') {
        const result = await client.alerts(
          { page: 1, pageSize: 5, subjectType: subject.entityType, subjectId: subject.entityId },
          signal,
        )
        if (current()) alerts.value = result
      }
    })
  }
  async function selectAudit(id: string) {
    const current = ++generation
    audit.value = null
    error.value = ''
    loading.value = true
    try {
      if (!auditScope || !audits.value?.items.some((item) => item.id === id))
        throw new Error('该审计记录不在当前查询范围内')
      const detail = await api().audit(id)
      if (current === generation) {
        validateAudit(detail, auditScope, context.value)
        audit.value = detail
      }
    } catch (exception) {
      if (current === generation) error.value = describeError(exception)
    } finally {
      if (current === generation) loading.value = false
    }
  }
  async function loadAlerts(query: C.AlertQuery, selectedId?: string) {
    await load(async (client, signal, current) => {
      const result = await client.alerts(query, signal)
      if (!current()) return
      alerts.value = result
      if (selectedId) {
        const detail = await client.alert(selectedId, signal)
        if (current()) alert.value = detail
      }
    })
  }
  async function selectAlert(id: string) {
    const current = ++alertGeneration
    const pageGeneration = generation
    alert.value = null
    actionError.value = ''
    try {
      const detail = await api().alert(id)
      if (current === alertGeneration && pageGeneration === generation) alert.value = detail
    } catch (exception) {
      if (current === alertGeneration && pageGeneration === generation)
        actionError.value = describeError(exception)
    }
  }
  async function openEvidence(id: string) {
    closeEvidence()
    const current = evidenceGeneration
    evidenceLoading.value = true
    evidenceController = new AbortController()
    try {
      const result = await api().evidence(id, evidenceController.signal)
      if (current === evidenceGeneration) evidence.value = result
    } catch (exception) {
      if (current === evidenceGeneration) evidenceError.value = describeError(exception)
    } finally {
      if (current === evidenceGeneration) evidenceLoading.value = false
    }
  }
  function closeEvidence() {
    evidenceGeneration++
    evidenceController?.abort()
    evidence.value = null
    evidenceError.value = ''
    evidenceLoading.value = false
  }
  async function act(
    action: 'claim' | 'evidence' | 'resolve',
    data: Omit<C.AlertAction, 'expectedVersion'>,
    requestId: string,
  ) {
    if (!alert.value || busy.value) return false
    const selected = alert.value
    const current = generation
    busy.value = true
    actionError.value = ''
    try {
      const result = await api().alertAction(
        selected.id,
        action,
        { ...data, expectedVersion: selected.version },
        requestId,
      )
      if (current === generation && alert.value?.id === selected.id) {
        alert.value = result
        if (alerts.value)
          alerts.value = {
            ...alerts.value,
            items: alerts.value.items.map((a) => (a.id === result.id ? result : a)),
          }
      }
      return true
    } catch (exception) {
      if (current === generation) {
        actionError.value = describeError(exception)
        try {
          const actual = await api().alert(selected.id)
          if (current === generation && alert.value?.id === selected.id) alert.value = actual
        } catch {
          if (current === generation && alert.value?.id === selected.id) {
            alert.value = null
            actionError.value += '；最新状态加载失败，请刷新后再操作'
          }
        }
      }
      return false
    } finally {
      busy.value = false
    }
  }
  async function review(data: C.AuditReview, requestId: string) {
    if (!audit.value || busy.value) return false
    busy.value = true
    actionError.value = ''
    const selected = audit.value
    const current = generation
    try {
      const result = await api().review(selected.id, data, requestId)
      if (current === generation) audit.value = result
      return true
    } catch (exception) {
      if (current === generation) {
        actionError.value = describeError(exception)
        try {
          const latest = await api().audit(selected.id)
          if (current === generation && audit.value?.id === selected.id) {
            if (auditScope) validateAudit(latest, auditScope, context.value)
            audit.value = latest
          }
        } catch {
          if (current === generation) {
            audit.value = null
            actionError.value += '；审计最新状态读取失败，请重新查询'
          }
        }
      }
      return false
    } finally {
      busy.value = false
    }
  }
  async function execute(
    capability: C.Capability,
    subject?: Pick<C.SubjectRef, 'entityId' | 'entityType'>,
  ) {
    if (busy.value) return
    const resolved = context.value
    const input: Record<string, unknown> = {}
    if (capability === 'neuron_audit') {
      actionError.value = '精确版本 / 捕获执行扩展尚未联调，暂不可执行'
      return
    }
    if (capability === 'training_monitor' && resolved?.subjectRef?.entityType === 'training_task')
      input.trainingTaskId = resolved.subjectRef.entityId
    if (capability === 'reasoning_audit' && resolved?.inferenceId)
      input.inferenceId = resolved.inferenceId
    if (capability === 'full_chain_audit' && resolved?.taskId) input.taskId = resolved.taskId
    if (capability === 'lineage_audit' && lineage.value?.nodes.length && subject) {
      if (subject.entityType === 'model') input.modelId = subject.entityId
      if (subject.entityType === 'dataset') input.datasetId = subject.entityId
    }
    if (!Object.keys(input).length) {
      actionError.value = '缺少已解析的规范任务或调用 ID，不能执行'
      return
    }
    busy.value = true
    actionError.value = ''
    const current = generation
    const poll = async () => {
      if (current !== generation || !task.value) return
      try {
        const result = await api().task(task.value.taskId, controller?.signal)
        if (current !== generation) return
        task.value = result
        if (['pending', 'running'].includes(result.status)) pollTimer = setTimeout(poll, 2000)
      } catch (exception) {
        if (current === generation) actionError.value = describeError(exception)
      }
    }
    try {
      const result = await api().execute(capability, input, crypto.randomUUID())
      if (current === generation) {
        task.value = result
        if (['pending', 'running'].includes(result.status)) pollTimer = setTimeout(poll, 2000)
      }
    } catch (exception) {
      if (current === generation) actionError.value = describeError(exception)
    } finally {
      busy.value = false
    }
  }
  // Dependency injection for contract/state tests, never exposed as a runtime fallback.
  function setTestApi(client: ComplianceApi) {
    override = client
  }
  return {
    demo,
    loading,
    error,
    busy,
    actionError,
    overview,
    lineage,
    audits,
    audit,
    context,
    trace,
    alerts,
    alert,
    evidence,
    evidenceError,
    evidenceLoading,
    task,
    candidates,
    loadCandidates,
    setDemo,
    stop,
    invalidate,
    loadOverview,
    loadLineage,
    loadContext,
    selectAudit,
    loadAlerts,
    selectAlert,
    openEvidence,
    closeEvidence,
    act,
    review,
    execute,
    setTestApi,
  }
})
