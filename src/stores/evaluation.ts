import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import { evaluationApi as api } from '../api/evaluation'
import type {
  Contexts,
  EvaluationEvent,
  EvaluationPageResult,
  EvaluationRun,
  EvaluationSession,
  EvaluationTask,
  Evidence,
  ExportJob,
  Issue,
  Manifest,
  Metric,
  MetricRevision,
  Preflight,
  RecordResolution,
  Sample,
} from '../types/evaluation'
export const useEvaluationStore = defineStore('evaluation', () => {
  const metrics = ref<EvaluationPageResult<Metric> | null>(null)
  const revisions = ref<MetricRevision[]>([])
  const revision = ref<MetricRevision | null>(null)
  const contexts = ref<Contexts | null>(null)
  const preflight = ref<Preflight | null>(null)
  const tasks = ref<EvaluationPageResult<EvaluationTask> | null>(null)
  const task = ref<EvaluationTask | null>(null)
  const runs = ref<EvaluationPageResult<EvaluationRun> | null>(null)
  const run = ref<EvaluationRun | null>(null)
  const resolution = ref<RecordResolution | null>(null)
  const events = ref<EvaluationEvent[]>([])
  const manifest = ref<Manifest | null>(null)
  const evidence = ref<Evidence | null>(null)
  const samples = ref<EvaluationPageResult<Sample> | null>(null)
  const exportJob = ref<ExportJob | null>(null)
  const session = ref<EvaluationSession | null>(null)
  const error = ref('')
  const issues = ref<Issue[]>([])
  const loading = ref(false)
  const writing = ref(false)
  const updatedAt = ref('')
  const controllers = new Map<string, AbortController>()
  const keys = new Map<string, { fingerprint: string; key: string }>()
  const failures = new Map<string, unknown>()
  let generation = 0
  function describeError(cause: unknown) {
    if (axios.isAxiosError(cause)) {
      const status = cause.response?.status
      const body = cause.response?.data as
        { message?: string; detail?: string; data?: { issues?: Issue[] } } | undefined
      issues.value = body?.data?.issues || []
      error.value =
        status === 401
          ? '尚未登录或授权已失效，请使用有效账户登录。'
          : status === 403
            ? '当前账户没有执行此操作的权限。'
            : status === 404
              ? '指定记录不存在，请重新选择。'
              : body?.message || body?.detail || '暂时无法连接评估服务，请检查连接后重试。'
    } else error.value = cause instanceof Error ? cause.message : '请求失败，请重试。'
  }
  function clear() {
    generation++
    controllers.forEach((controller) => controller.abort())
    controllers.clear()
    failures.clear()
    metrics.value = null
    tasks.value = null
    runs.value = null
    revision.value = null
    revisions.value = []
    contexts.value = null
    preflight.value = null
    task.value = null
    run.value = null
    resolution.value = null
    events.value = []
    manifest.value = null
    evidence.value = null
    samples.value = null
    exportJob.value = null
    error.value = ''
    issues.value = []
    updatedAt.value = ''
    loading.value = false
  }
  async function fetchData<T>(
    channel: string,
    fetcher: (signal: AbortSignal) => Promise<T>,
    apply: (value: T) => void,
  ): Promise<boolean> {
    controllers.get(channel)?.abort()
    const controller = new AbortController()
    controllers.set(channel, controller)
    const epoch = generation
    loading.value = true
    try {
      const value = await fetcher(controller.signal)
      if (
        epoch !== generation ||
        controllers.get(channel) !== controller ||
        controller.signal.aborted
      )
        return false
      apply(value)
      failures.delete(channel)
      if (!failures.size) {
        error.value = ''
        issues.value = []
      } else describeError([...failures.values()].at(-1))
      updatedAt.value = new Date().toISOString()
      return true
    } catch (cause) {
      if (!controller.signal.aborted && epoch === generation) {
        failures.set(channel, cause)
        if (channel === 'session') session.value = null
        describeError(cause)
      }
      return false
    } finally {
      if (controllers.get(channel) === controller) controllers.delete(channel)
      loading.value = controllers.size > 0
    }
  }
  async function write<T>(
    operation: string,
    input: unknown,
    action: (key: string) => Promise<T>,
  ): Promise<T | null> {
    if (writing.value) return null
    const fingerprint = JSON.stringify(input)
    let entry = keys.get(operation)
    if (!entry || entry.fingerprint !== fingerprint) {
      entry = { fingerprint, key: crypto.randomUUID() }
      keys.set(operation, entry)
    }
    writing.value = true
    const epoch = generation
    error.value = ''
    issues.value = []
    try {
      const result = await action(entry.key)
      keys.delete(operation)
      return epoch === generation ? result : null
    } catch (cause) {
      if (epoch === generation) describeError(cause)
      return null
    } finally {
      writing.value = false
    }
  }
  function loadSession() {
    return fetchData('session', api.session, (value) => {
      session.value = value
    })
  }
  async function authorize(token: string) {
    sessionStorage.setItem('evaluationAccessToken', token.trim())
    clear()
    return loadSession()
  }
  async function download(artifactId: string) {
    const ticket = await write('ticket:' + artifactId, artifactId, (key) =>
      api.ticket(artifactId, key),
    )
    if (!ticket) return
    const origin = new URL(import.meta.env.VITE_API_BASE_URL || '/api/v1', window.location.href)
      .origin
    const url = new URL(ticket.url, origin)
    if (url.origin !== origin || !url.pathname.startsWith('/api/v1/evaluation/downloads/')) {
      error.value = '下载地址校验失败'
      return
    }
    const link = document.createElement('a')
    link.href = url.href
    link.download = ticket.fileName
    link.rel = 'noopener'
    link.click()
  }
  return {
    metrics,
    revisions,
    revision,
    contexts,
    preflight,
    tasks,
    task,
    runs,
    run,
    resolution,
    events,
    manifest,
    evidence,
    samples,
    exportJob,
    session,
    error,
    issues,
    loading,
    writing,
    updatedAt,
    clear,
    fetchData,
    write,
    loadSession,
    authorize,
    download,
  }
})
