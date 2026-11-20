import { isAxiosError } from 'axios'
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { isGovernanceLlm } from '../api/governance-llm'
import { isMock } from '../api/request'
import type { TaskStatus } from '../types'
import type { GovernanceScope } from '../utils/governance-scope'

interface RunTask {
  status: TaskStatus
  resultId?: string | null
  errorMessage?: string | null
}

interface RunOptions<T> {
  create: (scope: GovernanceScope) => Promise<T>
  get: (id: string) => Promise<T>
  id: (task: T) => string
  onTask?: (task: T) => void
  // Defer replacing the visible result while the user is saving a review.
  onResult: (id: string, current: () => boolean) => Promise<void | false>
}

const memory = new Map<string, string | null>()
// A POST can outlive the page instance that sent it.
const submissions = new Map<string, Promise<RunTask>>()

function read(key: string) {
  if (memory.has(key)) return memory.get(key)
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, value)
    memory.delete(key)
  } catch {
    memory.set(key, value)
  }
}

export function useGovernanceRun<T extends RunTask>(
  page: 'value' | 'anomaly' | 'risk',
  scope: GovernanceScope,
  options: RunOptions<T>,
) {
  const mode = isGovernanceLlm ? 'llm' : isMock ? 'demo' : 'business'
  const prefix = `governance:${mode}:${page}`
  const scopeStorageKey = `${prefix}:scope`
  const taskKey = () =>
    `${prefix}:task:${JSON.stringify([scope.datasetId, scope.versionId, scope.language, scope.schemeId])}`
  const task = shallowRef<T>()
  const phase = ref<'idle' | 'submitting' | 'checking' | 'active' | 'result'>('idle')
  const issue = ref('')
  const canRetry = ref(false)
  const submitting = computed(() => phase.value === 'submitting')
  const locked = computed(() => phase.value !== 'idle')
  const message = computed(() => {
    if (issue.value) return ''
    if (phase.value === 'submitting') return '正在提交任务'
    if (phase.value === 'checking') return '正在恢复任务进度'
    if (phase.value === 'result') return '任务已完成，正在加载结果'
    if (phase.value === 'active')
      return task.value?.status === 'pending' ? '任务已排队，等待执行' : '任务正在运行'
    return ''
  })
  let generation = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  function rememberedScope(): Partial<GovernanceScope> {
    try {
      const saved = JSON.parse(read(scopeStorageKey) || 'null')
      return saved && typeof saved === 'object' ? saved : {}
    } catch {
      return {}
    }
  }

  function rememberScope() {
    const { datasetId, versionId, language, schemeId } = scope
    if (datasetId && versionId && language && schemeId)
      write(scopeStorageKey, JSON.stringify({ datasetId, versionId, language, schemeId }))
  }

  function reset() {
    ++generation
    clearTimeout(timer)
    task.value = undefined
    phase.value = 'idle'
    issue.value = ''
    canRetry.value = false
  }

  async function accept(next: T, key: string, current: () => boolean) {
    if (!current()) return
    task.value = next
    options.onTask?.(next)
    if (next.status === 'pending' || next.status === 'running') {
      phase.value = 'active'
      timer = setTimeout(() => void poll(options.id(next), key, current), 2000)
      return
    }
    if (next.status === 'succeeded' && next.resultId) {
      phase.value = 'result'
      try {
        const applied = await options.onResult(next.resultId, current)
        if (!current()) return
        if (applied === false) {
          timer = setTimeout(() => void accept(next, key, current), 2000)
          return
        }
      } catch {
        if (current()) {
          issue.value = '任务已完成，结果加载失败。'
          canRetry.value = true
        }
        return
      }
    } else if (next.status === 'failed') {
      issue.value = next.errorMessage ? `任务失败：${next.errorMessage}` : '任务执行失败。'
    } else if (next.status === 'cancelled') {
      issue.value = '任务已取消。'
    } else {
      issue.value = '任务已结束，未返回结果编号。'
    }
    write(key, null)
    phase.value = 'idle'
  }

  async function poll(id: string, key: string, current: () => boolean) {
    if (!current()) return
    try {
      await accept(await options.get(id), key, current)
    } catch (error) {
      if (!current()) return
      if (
        (isAxiosError(error) && error.response?.status === 404) ||
        (mode === 'demo' && error instanceof Error && error.message === '任务不存在')
      ) {
        write(key, null)
        task.value = undefined
        phase.value = 'idle'
        issue.value = '原任务已无法查询，可以重新发起。'
      } else {
        issue.value = '任务状态查询失败。请重试查询。'
        canRetry.value = true
      }
    }
  }

  async function restore() {
    if (disposed) return
    reset()
    const key = taskKey()
    const ticket = generation
    const current = () => ticket === generation && key === taskKey()
    const submission = submissions.get(key)
    if (submission) {
      phase.value = 'submitting'
      try {
        await submission
      } catch (error) {
        if (current()) reportSubmissionError(error)
        return
      }
    }
    if (!current()) return
    const id = read(key)
    if (id) {
      phase.value = 'checking'
      await poll(id, key, current)
    } else {
      phase.value = 'idle'
    }
  }

  function reportSubmissionError(error: unknown) {
    phase.value = 'idle'
    issue.value = error instanceof Error ? error.message : '任务提交失败。'
  }

  async function start() {
    if (disposed || locked.value) return
    const key = taskKey()
    if (submissions.has(key) || read(key)) return restore()
    reset()
    const ticket = generation
    const current = () => ticket === generation && key === taskKey()
    const input = { ...scope }
    phase.value = 'submitting'
    const submission = Promise.resolve()
      .then(() => options.create(input))
      .then((created) => {
        const id = options.id(created)
        if (!id) throw new Error('任务接口缺少任务编号。')
        write(key, id)
        return created
      })
      .finally(() => submissions.delete(key))
    submissions.set(key, submission)
    try {
      await accept(await submission, key, current)
    } catch (error) {
      if (current()) reportSubmissionError(error)
    }
  }

  onBeforeUnmount(() => {
    disposed = true
    ++generation
    clearTimeout(timer)
  })

  return {
    task,
    message,
    issue,
    canRetry,
    submitting,
    locked,
    reset,
    restore,
    start,
    rememberedScope,
    rememberScope,
  }
}
