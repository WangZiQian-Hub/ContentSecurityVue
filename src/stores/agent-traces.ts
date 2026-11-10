import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { agentTraceHttp } from '../api/agent-traces'
import { createAgentTraceMock } from '../mock/agent-traces'
import type {
  AgentTraceApi,
  Command,
  Detail,
  Query,
  TraceTask,
  Workspace,
} from '../types/agent-traces'
export const useAgentTraceStore = defineStore('agent-traces', () => {
  let api: AgentTraceApi = agentTraceHttp,
    generation = 0,
    detailGeneration = 0,
    listGeneration = 0,
    modeGeneration = 0,
    controller: AbortController | undefined,
    detailController: AbortController | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const demo = ref(false),
    workspace = shallowRef<Workspace | null>(null),
    detail = shallowRef<Detail | null>(null),
    query = ref<Query>({}),
    loading = ref(false),
    detailLoading = ref(false),
    busy = ref(false),
    error = ref(''),
    detailError = ref(''),
    actionError = ref(''),
    task = shallowRef<TraceTask | null>(null)
  const pendingKeys = new Map<string, string>()
  const key = (payload: unknown) => {
    const p = JSON.stringify(payload)
    if (!pendingKeys.has(p)) pendingKeys.set(p, crypto.randomUUID())
    return pendingKeys.get(p)!
  }
  function stop() {
    generation++
    detailGeneration++
    listGeneration++
    controller?.abort()
    detailController?.abort()
    clearTimeout(timer)
    busy.value = false
    loading.value = false
    detailLoading.value = false
  }
  function configure(mode: boolean) {
    modeGeneration++
    stop()
    api.dispose?.()
    api = mode ? createAgentTraceMock() : agentTraceHttp
    demo.value = mode
    workspace.value = null
    detail.value = null
    task.value = null
    query.value = {}
    error.value = ''
    detailError.value = ''
    actionError.value = ''
    pendingKeys.clear()
  }
  function message(e: unknown) {
    return e instanceof Error ? e.message : '请求失败，请重试'
  }
  async function load(q: Query = {}) {
    controller?.abort()
    detailController?.abort()
    const current = ++generation
    detailGeneration++
    controller = new AbortController()
    loading.value = true
    error.value = ''
    detail.value = null
    query.value = { ...q }
    try {
      const w = await api.workspace(q, controller.signal)
      if (current !== generation) return
      workspace.value = w
      const s = w.resolvedSelection
      query.value = {
        ...q,
        batchId: s.batchId || undefined,
        snapshotId: s.snapshotId || undefined,
        sourceId: q.issueType ? undefined : s.sourceId || undefined,
        traceId: s.traceId || undefined,
      }
      if (s.traceId) await select(s.traceId, q.eventId, q.eventPage || 1, q.eventTypes)
      if (current === generation) resume()
    } catch (e) {
      if (current === generation && !controller?.signal.aborted) {
        workspace.value = null
        error.value = message(e)
      }
    } finally {
      if (current === generation) loading.value = false
    }
  }
  async function select(traceId: string, eventId?: string, eventPage = 1, eventTypes?: string) {
    detailController?.abort()
    const current = ++detailGeneration
    detailController = new AbortController()
    const q = { ...query.value, traceId, eventId, eventPage, eventTypes }
    detail.value = null
    detailLoading.value = true
    detailError.value = ''
    try {
      if (!q.batchId || !q.snapshotId) throw new Error('尚无有效快照')
      const d = await api.detail(q.batchId, traceId, q, detailController.signal)
      if (current !== detailGeneration) return
      if (
        d.batchId !== q.batchId ||
        d.snapshotId !== q.snapshotId ||
        d.traceId !== traceId ||
        (q.sourceId && d.sourceId !== q.sourceId)
      )
        throw new Error('详情上下文不匹配，未展示原文')
      detail.value = d
      query.value = {
        ...query.value,
        traceId,
        eventId: d.selectedEventId || undefined,
        eventPage: d.selectedEventPage || d.events.page,
        eventTypes,
      }
    } catch (e) {
      if (current === detailGeneration && !detailController?.signal.aborted)
        detailError.value = message(e)
    } finally {
      if (current === detailGeneration) detailLoading.value = false
    }
  }
  async function samples(page = 1, q?: string) {
    const current = ++listGeneration
    try {
      if (!query.value.batchId || !query.value.snapshotId) return
      const p = await api.samples(query.value.batchId, {
        ...query.value,
        page,
        q: q ?? query.value.q,
      })
      if (current !== listGeneration || !workspace.value) return
      workspace.value = { ...workspace.value, samplePage: p }
      query.value = { ...query.value, page, q: q ?? query.value.q }
    } catch (e) {
      if (current === listGeneration) detailError.value = message(e)
    }
  }
  let optionGeneration = 0
  async function options(optionQ = '', optionPage = 1, batchOptionPage = 1) {
    const context = generation
    const current = ++optionGeneration,
      mode = modeGeneration
    try {
      const value = await api.workspace({ ...query.value, optionQ, optionPage, batchOptionPage })
      if (
        context !== generation ||
        mode !== modeGeneration ||
        current !== optionGeneration ||
        !workspace.value
      )
        return
      workspace.value = {
        ...workspace.value,
        sourceOptions: value.sourceOptions,
        batchOptions: value.batchOptions,
      }
    } catch (e) {
      if (mode === modeGeneration) detailError.value = message(e)
    }
  }
  async function action(fn: () => Promise<void>) {
    const mode = modeGeneration
    busy.value = true
    actionError.value = ''
    try {
      await fn()
    } catch (e) {
      if (mode === modeGeneration) actionError.value = message(e)
    } finally {
      if (mode === modeGeneration) busy.value = false
    }
  }
  async function create(name: string) {
    await action(async () => {
      const mode = modeGeneration
      const payload = { name }
      const b = await api.createBatch(name, key(payload))
      if (mode !== modeGeneration) return
      pendingKeys.delete(JSON.stringify(payload))
      await load({ batchId: b.batchId })
    })
  }
  async function bind(files: { fileId: string; formatOverride: string }[]) {
    const mode = modeGeneration
    const b = workspace.value?.batch
    if (!b) throw new Error('请先创建或选择批次')
    const payload = { batchId: b.batchId, version: b.batchVersion, files }
    await api.bind(b.batchId, b.batchVersion, files, key(payload))
    if (mode !== modeGeneration) return
    pendingKeys.delete(JSON.stringify(payload))
    await load({ batchId: b.batchId, sourceId: query.value.sourceId })
  }
  async function upload(file: File) {
    return api.upload(
      file,
      key({ name: file.name, size: file.size, lastModified: file.lastModified }),
    )
  }
  async function submit(command: Command) {
    await action(async () => {
      const current = generation
      const t = await api.execute(command, key(command))
      pendingKeys.delete(JSON.stringify(command))
      if (current !== generation) return
      task.value = t
      poll(t.taskId, current)
    })
  }
  function poll(id: string, current = generation) {
    clearTimeout(timer)
    timer = setTimeout(
      async () => {
        try {
          const t = await api.task(id)
          if (current !== generation) return
          task.value = t
          if (['pending', 'running'].includes(t.status)) poll(id, current)
          else if (t.status === 'succeeded' && t.result?.kind === 'agent_trace_ingest')
            await load({ batchId: t.result.batchId })
          else if (t.status === 'failed') actionError.value = t.errorMessage || '任务失败'
        } catch (e) {
          if (current === generation) actionError.value = message(e)
        }
      },
      demo.value ? 250 : 2000,
    )
  }
  function resume() {
    const t = workspace.value?.activeTasks[0]
    if (t) {
      task.value = t
      poll(t.taskId)
    }
  }
  async function ticket(id: string) {
    return api.ticket(id, crypto.randomUUID())
  }
  function dispose() {
    stop()
    api.dispose?.()
  }
  function statisticsSource(q: Query = {}) {
    if (!demo.value || !api.statisticsSource) throw new Error('统计演示源不可用')
    return api.statisticsSource(q)
  }
  return {
    statisticsSource,
    demo,
    workspace,
    detail,
    query,
    loading,
    detailLoading,
    busy,
    error,
    detailError,
    actionError,
    task,
    configure,
    load,
    select,
    samples,
    options,
    action,
    create,
    bind,
    upload,
    submit,
    resume,
    ticket,
    dispose,
  }
})
