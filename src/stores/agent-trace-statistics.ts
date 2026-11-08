import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { agentTraceStatisticsHttp } from '../api/agent-trace-statistics'
import { downloadTraceTicket } from '../api/agent-traces'
import type {
  AgentTraceStatisticsApi,
  AgentTraceStatisticsQuery as Query,
  AgentTraceStatisticsWorkspace as Workspace,
  AgentTraceStatisticsDetail as Detail,
  AgentTraceListFilter,
  AgentTraceStatisticsExport,
  AgentTraceScope,
  AgentTraceContext,
} from '../types/agent-trace-statistics'
import type { TraceTask } from '../types/agent-traces'

export const useAgentTraceStatisticsStore = defineStore('agent-trace-statistics', () => {
  let api: AgentTraceStatisticsApi = agentTraceStatisticsHttp
  const workspace = shallowRef<Workspace | null>(null),
    detail = shallowRef<Detail | null>(null),
    query = ref<Query>({}),
    demo = ref(false)
  const loading = ref(false),
    listLoading = ref(false),
    detailLoading = ref(false),
    error = ref(''),
    listError = ref(''),
    detailError = ref(''),
    exportError = ref(''),
    task = shallowRef<TraceTask | null>(null),
    exportBusy = ref(false)
  const opened = ref(false),
    selectedId = ref(''),
    exportScope = shallowRef<AgentTraceStatisticsExport['input'] | null>(null)
  const generations = { main: 0, list: 0, detail: 0, options: 0, export: 0 }
  type Domain = keyof typeof generations
  const controllers: Partial<Record<Domain, AbortController>> = {}
  let timer: ReturnType<typeof setTimeout> | undefined
  let retryCommand: AgentTraceStatisticsExport | null = null,
    retryKey = ''
  const message = (e: unknown) => {
    const serverMessage = (e as { response?: { data?: { message?: unknown } } })?.response?.data
      ?.message
    const status = (e as { response?: { status?: number } })?.response?.status
    const prefix: Record<number, string> = {
      403: '没有权限',
      404: '接口尚未部署或对象不存在',
      409: '上下文冲突，请重新查询',
      410: '快照或产物已过期，请重新查询',
      422: '请求参数或能力不可用',
      429: '请求过于频繁，请稍后重试',
      503: '服务暂不可用',
    }
    return `${status && prefix[status] ? prefix[status] + '：' : ''}${typeof serverMessage === 'string' ? serverMessage : e instanceof Error ? e.message : '请求失败，请重试'}`
  }
  function cancel(domain: Domain) {
    generations[domain]++
    controllers[domain]?.abort()
  }
  function start(domain: Domain) {
    cancel(domain)
    const controller = new AbortController()
    controllers[domain] = controller
    return { version: generations[domain], signal: controller.signal }
  }
  function matches(scope: AgentTraceScope, expected: Query) {
    return (
      (!expected.batchId || scope.batchId === expected.batchId) &&
      (!expected.snapshotId || scope.snapshotId === expected.snapshotId) &&
      (!expected.projectionVersion || scope.projectionVersion === expected.projectionVersion) &&
      scope.language === (expected.language || 'all')
    )
  }
  function matchesList(ctx: AgentTraceContext, q: Query) {
    return (
      matches(ctx, q) &&
      ctx.listFilter === (q.listFilter || 'all') &&
      ctx.pageSize === (q.pageSize || 6)
    )
  }
  function close() {
    cancel('detail')
    opened.value = false
    detail.value = null
    selectedId.value = ''
    detailLoading.value = false
    detailError.value = ''
  }
  function stopExport() {
    cancel('export')
    clearTimeout(timer)
    exportBusy.value = false
  }
  function dispose() {
    for (const domain of Object.keys(generations) as Domain[]) cancel(domain)
    clearTimeout(timer)
    api.dispose?.()
    loading.value = listLoading.value = detailLoading.value = exportBusy.value = false
  }
  function configure(mode: boolean, implementation?: AgentTraceStatisticsApi) {
    dispose()
    api = implementation || agentTraceStatisticsHttp
    demo.value = mode
    workspace.value = detail.value = null
    query.value = {}
    task.value = null
    opened.value = false
    error.value = listError.value = detailError.value = exportError.value = ''
    selectedId.value = ''
    retryCommand = null
    retryKey = ''
    exportScope.value = null
  }
  async function load(q: Query = {}) {
    const { version, signal } = start('main')
    cancel('list')
    cancel('options')
    close()
    loading.value = true
    listLoading.value = false
    error.value = ''
    listError.value = ''
    workspace.value = null
    try {
      const w = await api.statistics(q, signal)
      if (version !== generations.main) return
      if (
        w.scope &&
        (!matches(w.scope, q) ||
          !matchesList(w.samplePage.context, { ...q, ...w.scope }) ||
          w.samplePage.page !== (q.page || 1))
      )
        throw new Error('统计响应范围不一致，已拒绝展示')
      workspace.value = w
      query.value = {
        ...q,
        ...w.resolvedSelection,
        listFilter: q.listFilter || 'all',
        page: w.samplePage.page,
        pageSize: w.samplePage.pageSize,
      }
    } catch (e) {
      if (version === generations.main && !signal.aborted) error.value = message(e)
    } finally {
      if (version === generations.main) loading.value = false
    }
  }
  async function options(optionQ = '', optionPage = 1) {
    const { version, signal } = start('options'),
      main = generations.main
    try {
      const w = await api.statistics(
        { batchId: query.value.batchId, include: 'options', optionQ, optionPage },
        signal,
      )
      if (main === generations.main && version === generations.options && workspace.value) {
        const retained = workspace.value.batchOptions.items.filter(
          (b) => optionPage > 1 || b.batchId === query.value.batchId,
        )
        const items = [
          ...new Map([...retained, ...w.batchOptions.items].map((b) => [b.batchId, b])).values(),
        ]
        workspace.value = { ...workspace.value, batchOptions: { ...w.batchOptions, items } }
      }
    } catch (e) {
      if (version === generations.options && !signal.aborted) listError.value = message(e)
    }
  }
  async function samples(
    page = 1,
    listFilter: AgentTraceListFilter = query.value.listFilter || 'all',
    keepDrawer = false,
  ) {
    if (!workspace.value?.scope) return
    if (!keepDrawer) close()
    const { version, signal } = start('list'),
      main = generations.main,
      q = { ...query.value, page, listFilter }
    listLoading.value = true
    listError.value = ''
    try {
      const p = await api.samples(q.batchId!, q, signal)
      if (version !== generations.list || main !== generations.main || !workspace.value)
        return false
      if (!matchesList(p.context, q) || p.page !== page) throw new Error('列表响应范围不一致')
      workspace.value = { ...workspace.value, samplePage: p, listContext: p.context }
      query.value = q
      return true
    } catch (e) {
      if (version === generations.list && !signal.aborted) listError.value = message(e)
      return false
    } finally {
      if (version === generations.list) listLoading.value = false
    }
  }
  async function select(traceId: string) {
    if (!workspace.value?.scope || !workspace.value.permissions.canViewDetail) return
    const { version, signal } = start('detail'),
      q = { ...query.value }
    opened.value = true
    selectedId.value = traceId
    detail.value = null
    detailLoading.value = true
    detailError.value = ''
    try {
      const d = await api.sample(q.batchId!, traceId, q, signal)
      if (version !== generations.detail) return
      if (
        !matches(d, q) ||
        d.traceId !== traceId ||
        !matchesList(d.navigation.context, q) ||
        d.summary.traceId !== traceId
      )
        throw new Error('详情身份或筛选范围不一致，已拒绝显示')
      if (d.navigation.page !== query.value.page) {
        const ok = await samples(d.navigation.page, q.listFilter, true)
        if (version !== generations.detail) return
        if (!ok) throw new Error('目标列表页加载失败，请重试当前样本')
      }
      detail.value = d
    } catch (e) {
      if (version === generations.detail && !signal.aborted) detailError.value = message(e)
    } finally {
      if (version === generations.detail) detailLoading.value = false
    }
  }
  async function more(representation: 'sample' | 'raw') {
    const d = detail.value
    if (!d) return
    const cursor = representation === 'sample' ? d.sampleJson.nextCursor : d.rawPreview.nextCursor
    if (!cursor) return
    const { version, signal } = start('detail')
    detailLoading.value = true
    detailError.value = ''
    try {
      const r = await api.sample(
        d.batchId,
        d.traceId,
        { ...query.value, representation, contentCursor: cursor },
        signal,
      )
      if (version !== generations.detail) return
      const chunk = r.contentChunk,
        old = representation === 'sample' ? d.sampleJson.jsonText : d.rawPreview.rawText
      if (
        !matches(r, query.value) ||
        r.traceId !== d.traceId ||
        !chunk ||
        chunk.contentVersion !== d.sampleJson.contentVersion ||
        chunk.offsetBytes !== new TextEncoder().encode(old).length
      )
        throw new Error('内容版本或分块位置不一致，请重新打开样本')
      const text = old + chunk.text
      if (new TextEncoder().encode(text).length > 1048576)
        throw new Error('预览已达到 1 MiB，请使用授权导出')
      if (representation === 'sample') {
        if (chunk.complete) JSON.parse(text)
        detail.value = {
          ...d,
          sampleJson: {
            ...d.sampleJson,
            jsonText: text,
            loadedBytes: new TextEncoder().encode(text).length,
            nextCursor: chunk.nextCursor,
            complete: chunk.complete,
            truncated: !chunk.complete,
            isValidJson: chunk.complete,
          },
        }
      } else
        detail.value = {
          ...d,
          rawPreview: {
            ...d.rawPreview,
            rawText: text,
            nextCursor: chunk.nextCursor,
            truncated: !chunk.complete,
          },
        }
    } catch (e) {
      if (version === generations.detail && !signal.aborted) detailError.value = message(e)
    } finally {
      if (version === generations.detail) detailLoading.value = false
    }
  }
  function exportAllowed(kind: string) {
    const w = workspace.value
    return (
      !!w?.scope &&
      w.permissions.canExport &&
      w.exportOptions.kinds.some(
        (k) =>
          k.exportKind === kind &&
          k.availability === 'available' &&
          k.formats.includes(kind === 'view' ? 'png' : kind === 'package' ? 'zip' : 'json'),
      )
    )
  }
  async function poll(id: string, version: number, wait = 2000) {
    clearTimeout(timer)
    timer = setTimeout(
      async () => {
        if (version !== generations.export) return
        try {
          const t = await api.task(id, controllers.export?.signal)
          if (version !== generations.export) return
          task.value = t
          if (['pending', 'running'].includes(t.status))
            poll(id, version, Math.max(2000, Math.min(10000, t.retryAfterMs || wait * 1.3)))
          else {
            exportBusy.value = false
            if (t.status === 'failed') exportError.value = t.errorMessage || '导出失败'
          }
        } catch (e) {
          if (version === generations.export) {
            exportError.value = message(e)
            exportBusy.value = false
          }
        }
      },
      demo.value ? 150 : wait,
    )
  }
  async function submit(command: AgentTraceStatisticsExport, reuse = false) {
    const { version, signal } = start('export')
    clearTimeout(timer)
    exportBusy.value = true
    exportError.value = ''
    if (!reuse || JSON.stringify(command) !== JSON.stringify(retryCommand))
      retryKey = crypto.randomUUID()
    retryCommand = command
    exportScope.value = command.input
    try {
      const t = await api.export(command, retryKey, signal)
      if (version !== generations.export) return
      task.value = t
      if (['pending', 'running'].includes(t.status)) poll(t.taskId, version)
      else {
        exportBusy.value = false
        if (t.status === 'failed') exportError.value = t.errorMessage || '任务失败'
      }
    } catch (e) {
      if (version === generations.export && !signal.aborted) {
        exportError.value = message(e)
        exportBusy.value = false
      }
    }
  }
  async function exportResult(
    kind: 'view' | 'package' | 'sample_json',
    currentSubset = false,
    contents = ['stats_summary', 'sample_table', 'normalized_json', 'manifest'],
    anonymizeIds = true,
  ) {
    const w = workspace.value
    if (!w?.scope || !exportAllowed(kind)) return
    if (kind === 'sample_json' && !detail.value?.permissions.exportJson) return
    const selectedContents = [...new Set([...contents, ...w.exportOptions.requiredContents])]
    if (
      kind === 'package' &&
      selectedContents.some(
        (code) =>
          !w.exportOptions.contents.some((c) => c.code === code && c.availability === 'available'),
      )
    ) {
      exportError.value = '包含未开放的导出内容，请重新选择'
      return
    }
    await submit({
      capabilityCode: 'agent_trace_export',
      name: `智能体轨迹统计 ${kind}`,
      input: {
        ...w.scope,
        view: 'statistics',
        exportKind: kind,
        format: kind === 'view' ? 'png' : kind === 'package' ? 'zip' : 'json',
        scope: {
          type: kind === 'sample_json' ? 'sample' : 'filtered',
          language: w.scope.language,
          listFilter:
            currentSubset || kind === 'sample_json' ? query.value.listFilter || 'all' : 'all',
          traceIds: kind === 'sample_json' ? [detail.value!.traceId] : [],
        },
        contents:
          kind === 'view'
            ? ['statistics_png']
            : kind === 'sample_json'
              ? ['normalized_json']
              : selectedContents,
        redactionProfile: 'standard',
        anonymizeIds,
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
        uiVersion: 'statistics_v1',
        uiState:
          kind === 'view'
            ? {
                listFilter: query.value.listFilter || 'all',
                page: query.value.page || 1,
                pageSize: query.value.pageSize || 6,
              }
            : undefined,
      },
    })
  }
  function resume() {
    if (task.value && ['pending', 'running'].includes(task.value.status)) {
      const { version } = start('export')
      exportBusy.value = true
      exportError.value = ''
      poll(task.value.taskId, version)
    }
  }
  async function retryExport() {
    if (retryCommand) await submit(retryCommand, true)
  }
  async function download(id: string) {
    const version = generations.export
    try {
      const ticket = await api.ticket(id, crypto.randomUUID())
      if (version !== generations.export) return
      await downloadTraceTicket(ticket, demo.value)
    } catch (e) {
      if (version === generations.export) exportError.value = message(e)
    }
  }
  return {
    workspace,
    detail,
    query,
    demo,
    loading,
    listLoading,
    detailLoading,
    error,
    listError,
    detailError,
    exportError,
    exportBusy,
    task,
    opened,
    selectedId,
    exportScope,
    configure,
    load,
    options,
    samples,
    select,
    more,
    close,
    dispose,
    exportAllowed,
    exportResult,
    stopExport,
    resume,
    retryExport,
    download,
  }
})
