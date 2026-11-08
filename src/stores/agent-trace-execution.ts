import { defineStore } from 'pinia'
import { ref, shallowRef, computed } from 'vue'
import { executionHttp } from '../api/agent-trace-execution'
import { createExecutionMock } from '../mock/agent-trace-execution'
import type {
  ExecutionWorkspace,
  ExecutionDetail,
  ExecutionQuery,
  ExecutionSelection,
} from '../types/agent-trace-execution'
export const useExecutionStore = defineStore('agent-trace-execution', () => {
  const workspace = shallowRef<ExecutionWorkspace | null>(null),
    detail = shallowRef<ExecutionDetail | null>(null),
    selection = shallowRef<ExecutionSelection | null>(null),
    draftBatchId = ref(''),
    loading = ref(false),
    detailLoading = ref(false),
    error = ref(''),
    detailError = ref(''),
    playing = ref(false),
    dirty = ref(false),
    raw = ref(false),
    query = ref<ExecutionQuery>({})
  let api = executionHttp,
    generation = 0,
    detailGeneration = 0,
    listGeneration = 0,
    controller: AbortController | undefined,
    detailController: AbortController | undefined,
    timer: ReturnType<typeof setTimeout> | undefined
  const options = ref<{ batchId: string; displayId: string }[]>([])
  const canExport = computed(
    () =>
      !!detail.value &&
      !loading.value &&
      !detailLoading.value &&
      !dirty.value &&
      !error.value &&
      !detailError.value &&
      !!workspace.value?.permissions.canExport &&
      detail.value.permissions.canExport,
  )
  function pause() {
    clearTimeout(timer)
    playing.value = false
  }
  function dispose() {
    generation++
    detailGeneration++
    listGeneration++
    controller?.abort()
    detailController?.abort()
    pause()
  }
  async function configure(demo: boolean, batchId?: string, traceId?: string, eventId?: string) {
    dispose()
    api = demo ? createExecutionMock() : executionHttp
    workspace.value = null
    detail.value = null
    selection.value = null
    error.value = ''
    detailError.value = ''
    raw.value = false
    query.value = {}
    draftBatchId.value = ''
    options.value = []
    dirty.value = false
    detailLoading.value = false
    loading.value = true
    controller = new AbortController()
    const signal = controller.signal
    const version = generation
    try {
      const w = await api.workspace({ include: 'options' }, signal)
      if (version !== generation) return
      options.value = w.batchOptions.items
      draftBatchId.value =
        (demo && batchId === 'mock_batch_1' ? 'mock_batch_demo' : batchId) ||
        options.value[0]?.batchId ||
        ''
      // First entry (and mode re-entry) immediately displays a real batch result.
      // Later draft changes remain local until the user explicitly clicks Query.
      if (draftBatchId.value && w.permissions.canQuery) await run(traceId, eventId)
      else if (!w.permissions.canQuery) error.value = '当前账号没有查询权限'
    } catch (e) {
      if (version === generation && !signal.aborted) error.value = String(e)
    } finally {
      if (version === generation) loading.value = false
    }
  }
  async function choose(traceId: string, eventId?: string) {
    pause()
    detailController?.abort()
    detailController = new AbortController()
    const n = ++detailGeneration,
      scope = workspace.value?.scope
    if (!scope) return
    detail.value = null
    selection.value = null
    detailLoading.value = true
    detailError.value = ''
    raw.value = false
    try {
      const d = await api.detail(
        scope.batchId,
        traceId,
        { ...scope, section: 'overview', eventId, redactionMode: 'redacted' },
        detailController.signal,
      )
      if (n !== detailGeneration) return
      if (
        d.traceId !== traceId ||
        d.scope.snapshotId !== scope.snapshotId ||
        d.scope.batchId !== scope.batchId ||
        d.scope.projectionVersion !== scope.projectionVersion
      )
        throw Error('详情上下文不匹配')
      detail.value = d
      selection.value = d.selection
    } catch (e) {
      if (n === detailGeneration && !detailController.signal.aborted) detailError.value = String(e)
    } finally {
      if (n === detailGeneration) detailLoading.value = false
    }
  }
  async function search(page = 1, filters: ExecutionQuery = {}) {
    pause()
    const scope = workspace.value?.scope
    if (!scope) return
    const n = ++listGeneration,
      g = generation
    query.value = {
      ...query.value,
      ...filters,
      page,
      pageSize: filters.pageSize ?? query.value.pageSize ?? workspace.value!.samplePage.pageSize,
    }
    try {
      const p = await api.samples(scope.batchId, { ...query.value, ...scope })
      if (n !== listGeneration || g !== generation) return
      workspace.value = { ...workspace.value!, samplePage: p }
      if (p.items.length) await choose(p.items[0]!.traceId)
      else {
        detail.value = null
        selection.value = null
      }
    } catch (e) {
      if (n === listGeneration && g === generation) error.value = String(e)
    }
  }
  async function run(traceId?: string, eventId?: string) {
    dispose()
    controller = new AbortController()
    const n = generation
    loading.value = true
    error.value = ''
    dirty.value = true
    detail.value = null
    selection.value = null
    query.value = {}
    try {
      const w = await api.workspace(
        { include: 'dashboard', batchId: draftBatchId.value },
        controller.signal,
      )
      if (n !== generation) return
      workspace.value = w
      dirty.value = false
      const chosen =
        traceId && w.samplePage.items.some((s) => s.traceId === traceId)
          ? traceId
          : w.selectedTraceId
      if (chosen) await choose(chosen, eventId)
    } catch (e) {
      if (n === generation && !controller.signal.aborted) error.value = String(e)
    } finally {
      if (n === generation) loading.value = false
    }
  }
  async function select(eventId: string, force = false) {
    const d = detail.value
    if (!d) return
    const cached = !force && d.events.items.find((e) => e.eventId === eventId)
    if (cached) {
      detailGeneration++
      detailController?.abort()
      detailLoading.value = false
      detailError.value = ''
      selection.value = cached.selectionPreview
      return
    }
    const n = ++detailGeneration
    detailController?.abort()
    detailController = new AbortController()
    detailLoading.value = true
    detailError.value = ''
    selection.value = null
    try {
      const part = await api.detail(
        d.scope.batchId,
        d.traceId,
        {
          ...d.scope,
          section: 'selection',
          eventId,
          redactionMode: raw.value ? 'raw' : 'redacted',
        },
        detailController.signal,
      )
      if (n !== detailGeneration) return
      if (
        part.scope.snapshotId !== d.scope.snapshotId ||
        part.traceId !== d.traceId ||
        part.scope.projectionVersion !== d.scope.projectionVersion
      )
        throw Error('事件上下文不匹配')
      detail.value = { ...d, events: part.events }
      selection.value = part.selection
    } catch (e) {
      if (n === detailGeneration && !detailController.signal.aborted) {
        pause()
        detailError.value = String(e)
      }
    } finally {
      if (n === detailGeneration) detailLoading.value = false
    }
  }
  async function step(direction: number) {
    const target = direction > 0 ? selection.value?.nextEventId : selection.value?.previousEventId
    if (target) await select(target)
    else pause()
  }
  async function eventPage(page: number) {
    pause()
    const d = detail.value
    if (!d) return
    const n = ++detailGeneration
    detailLoading.value = true
    try {
      const p = await api.detail(d.scope.batchId, d.traceId, {
        ...d.scope,
        section: 'events',
        eventPage: page,
        redactionMode: raw.value ? 'raw' : 'redacted',
      })
      if (n !== detailGeneration) return
      detail.value = { ...d, events: p.events }
      selection.value = p.selection
    } catch (e) {
      if (n === detailGeneration) detailError.value = String(e)
    } finally {
      if (n === detailGeneration) detailLoading.value = false
    }
  }
  function play() {
    if (playing.value) {
      pause()
      return
    }
    playing.value = true
    const tick = async () => {
      if (!playing.value) return
      await step(1)
      if (playing.value) timer = setTimeout(tick, 1000)
    }
    timer = setTimeout(tick, 1000)
  }
  async function toggleRaw(value: boolean) {
    pause()
    const id = selection.value?.eventId
    raw.value = value
    selection.value = null
    if (detail.value)
      detail.value = { ...detail.value, events: { ...detail.value.events, items: [] } }
    if (id) await select(id, true)
  }
  async function moreGraph() {
    const d = detail.value
    if (!d?.graph.nextCursor) return
    const g = generation
    try {
      const p = await api.detail(d.scope.batchId, d.traceId, {
        ...d.scope,
        section: 'graph',
        graphCursor: d.graph.nextCursor,
        redactionMode: raw.value ? 'raw' : 'redacted',
      })
      if (g !== generation || detail.value?.traceId !== d.traceId) return
      detail.value = {
        ...detail.value,
        graph: {
          ...p.graph,
          nodes: [
            ...new Map([...d.graph.nodes, ...p.graph.nodes].map((n) => [n.eventId, n])).values(),
          ],
          edges: [
            ...new Map([...d.graph.edges, ...p.graph.edges].map((e) => [e.edgeId, e])).values(),
          ],
        },
      }
    } catch (e) {
      detailError.value = String(e)
    }
  }
  return {
    workspace,
    detail,
    selection,
    draftBatchId,
    loading,
    detailLoading,
    error,
    detailError,
    playing,
    dirty,
    raw,
    query,
    options,
    canExport,
    configure,
    run,
    choose,
    search,
    select,
    step,
    eventPage,
    play,
    pause,
    toggleRaw,
    moreGraph,
    dispose,
  }
})
