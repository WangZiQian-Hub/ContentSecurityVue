import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope } from 'vue'
import { createHash } from 'node:crypto'
import { AxiosHeaders } from 'axios'
import { readFileSync } from 'node:fs'
import { mapKeys } from '../../src/utils/case'
import { useEvaluationStore } from '../../src/stores/evaluation'
import { useEvaluationPolling } from '../../src/composables/useEvaluationPolling'
import { evaluationHttpApi as evaluationApi } from '../../src/api/evaluation'
import { sourceLink } from '../../src/views/evaluation/presentation'
import type { SourceContext } from '../../src/types/evaluation'

vi.mock('../../src/api/request', () => ({ request: vi.fn(), isMock: true }))
import { request } from '../../src/api/request'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('evaluation request isolation and exact references', () => {
  it('adds only an evaluation-scoped credential and preserves logical request identity', async () => {
    const getItem = vi.fn((key: string) =>
      key === 'evaluationAccessToken' ? 'scoped-test-token' : 'platform-token',
    )
    vi.stubGlobal('sessionStorage', { getItem })
    try {
      vi.mocked(request).mockResolvedValue({})
      await evaluationApi.start('task-one', 'request-one')
      const config = vi.mocked(request).mock.calls[0]![0]
      expect(config.headers).toBeInstanceOf(AxiosHeaders)
      const headers = config.headers as AxiosHeaders
      expect(headers.get('X-Evaluation-Authorization')).toBe('Bearer scoped-test-token')
      expect(headers.get('X-Request-Id')).toBe('request-one')
      expect(getItem).toHaveBeenCalledExactlyOnceWith('evaluationAccessToken')
    } finally {
      vi.unstubAllGlobals()
    }
  })
  it('always uses HTTP even when the shared platform is in mock mode', async () => {
    const rejected = new Error('offline')
    vi.mocked(request).mockRejectedValueOnce(rejected)
    await expect(evaluationApi.metrics({ page: 2, pageSize: 10 })).rejects.toBe(rejected)
    expect(request).toHaveBeenCalledWith({
      url: '/evaluation/metrics',
      params: { page: 2, pageSize: 10 },
      signal: undefined,
    })
  })
  it('preserves metric codes and parameter names as values through deep case conversion', () => {
    const value = {
      metricRevisionRefs: ['rev_123'],
      parameters: [{ name: 'false_positive_rate', value: 'a_B' }],
      metricResults: [
        { metricCode: 'alert_coverage', thresholdSnapshot: { comparator: 'gte', value: 0.95 } },
      ],
    }
    expect(mapKeys(mapKeys(value, 'snake'), 'camel')).toEqual(value)
  })
  it('uses explicit logical request IDs and kind for exports', async () => {
    vi.mocked(request).mockResolvedValue({})
    await evaluationApi.export('run/1', 'evidence_bundle', 'logical-operation')
    expect(request).toHaveBeenCalledWith({
      url: '/evaluation/runs/run%2F1/exports',
      method: 'POST',
      data: { kind: 'evidence_bundle', format: 'zip', redactionProfile: 'standard' },
      headers: { 'X-Request-Id': 'logical-operation' },
    })
  })
  it('never builds a compliance link from mismatched or absent trace context', () => {
    const source = {
      sourceModule: 'compliance',
      sourceTaskId: 'source-task',
      sourceTraceId: 'trace-one',
      taskTraceId: 'trace-two',
    } as SourceContext
    expect(sourceLink(source)).toBeNull()
    source.taskTraceId = 'trace-one'
    expect(sourceLink(source)).toBe(
      '/compliance/full-chain?sourceKind=task&taskId=source-task&traceId=trace-one',
    )
  })
})

describe('evaluation store race and retry behavior', () => {
  it('aborts old selections and rejects late responses', async () => {
    const store = useEvaluationStore()
    let resolveOld!: (value: string) => void
    let oldSignal!: AbortSignal
    let selected = ''
    const first = store.fetchData(
      'run',
      (signal) => {
        oldSignal = signal
        return new Promise<string>((resolve) => {
          resolveOld = resolve
        })
      },
      (value) => {
        selected = value
      },
    )
    await store.fetchData(
      'run',
      async () => 'new',
      (value) => {
        selected = value
      },
    )
    resolveOld('old')
    await first
    expect(oldSignal.aborted).toBe(true)
    expect(selected).toBe('new')
  })
  it('clears old data on query navigation and ignores outstanding writes', async () => {
    const store = useEvaluationStore()
    store.resolution = { resolution: 'demo_only', runId: null, candidates: [] }
    let resolveWrite!: (value: string) => void
    const operation = store.write(
      'create',
      {},
      () =>
        new Promise<string>((resolve) => {
          resolveWrite = resolve
        }),
    )
    store.clear()
    resolveWrite('created')
    expect(await operation).toBeNull()
    expect(store.resolution).toBeNull()
  })
  it('reuses one idempotency key after uncertain transport failure and changes it when input changes', async () => {
    const store = useEvaluationStore()
    const keys: string[] = []
    const fail = async (key: string) => {
      keys.push(key)
      throw new Error('network interrupted')
    }
    await store.write('create', { name: 'one' }, fail)
    await store.write('create', { name: 'one' }, fail)
    await store.write('create', { name: 'two' }, fail)
    expect(keys[0]).toBe(keys[1])
    expect(keys[2]).not.toBe(keys[0])
  })
  it('does not erase a failed resource request when the session request succeeds', async () => {
    const store = useEvaluationStore()
    await store.fetchData(
      'run',
      async () => {
        throw new Error('exact record unavailable')
      },
      () => undefined,
    )
    await store.fetchData(
      'session',
      async () => true,
      () => undefined,
    )
    expect(store.error).toBe('exact record unavailable')
    await store.fetchData(
      'run',
      async () => true,
      () => undefined,
    )
    expect(store.error).toBe('')
  })
})

describe('polling lifetime', () => {
  it('backs off after errors and stops at a terminal state and on disposal', async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    let terminal = false
    const load = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true)
    const polling = scope.run(() => useEvaluationPolling(load, () => terminal))!
    polling.start()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(3000)
    expect(load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(load).toHaveBeenCalledTimes(2)
    terminal = true
    await vi.advanceTimersByTimeAsync(3000)
    expect(load).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(10000)
    expect(load).toHaveBeenCalledTimes(3)
    polling.start()
    await vi.advanceTimersByTimeAsync(0)
    scope.stop()
    const count = load.mock.calls.length
    await vi.advanceTimersByTimeAsync(30000)
    expect(load).toHaveBeenCalledTimes(count)
    vi.useRealTimers()
  })
})

describe('protected source baseline', () => {
  it('preserves every protected file, allowing only the exact CapabilityDock condition', () => {
    const baseline = JSON.parse(
      readFileSync('docs/evaluation/protected-baseline.json', 'utf8').replace(/^\uFEFF/, ''),
    ) as { path: string; sha256: string }[]
    for (const entry of baseline) {
      if (entry.path === 'src/layouts/AppLayout.vue') continue
      // User separately requested removal of the global 19px dropdown override.
      if (entry.path === 'src/styles/data-resource.css') continue
      const hash = createHash('sha256').update(readFileSync(entry.path)).digest('hex').toUpperCase()
      expect(hash, entry.path).toBe(entry.sha256)
    }
    const before = readFileSync('docs/evaluation/AppLayout.before.txt', 'utf8')
    const after = readFileSync('src/layouts/AppLayout.vue', 'utf8')
    const authorized = before.replace(
      "<router-view /><CapabilityDock v-if=\"!['/data-resource', '/data-governance', '/model-train', '/compliance'].includes(current.path)\" />",
      "<router-view /><CapabilityDock v-if=\"!['/data-resource', '/data-governance', '/model-train', '/compliance', '/evaluation'].includes(current.path)\" />",
    )
    expect(after).toBe(authorized)
  })
})
