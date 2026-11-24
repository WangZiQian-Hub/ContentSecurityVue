import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxiosAdapter } from 'axios'
import { request } from './request'
import { llmRequest } from './governance-llm'

vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn() } }))

beforeEach(() => {
  vi.stubGlobal('crypto', { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) })
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => (key === 'llmAccessToken' ? 'test-token' : null),
  })
})
afterEach(() => vi.unstubAllGlobals())

describe.each(['platform', 'llm'] as const)('%s request without native randomUUID', (kind) => {
  const send = (config: Parameters<typeof request>[0]) =>
    kind === 'platform' ? request(config) : llmRequest(config, { silent: true })

  it('reaches the transport with a UUID and preserves response mapping', async () => {
    const adapter: AxiosAdapter = async (config) => {
      expect(config.headers.get('X-Request-Id')).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      )
      return {
        config,
        data: { code: 0, data: { access_token: 'ok' } },
        status: 200,
        statusText: 'OK',
        headers: {},
      }
    }
    expect(await send({ url: '/auth/login', method: 'POST', data: {}, adapter })).toEqual({
      accessToken: 'ok',
    })
  })

  it('keeps the supplied idempotency key on a failed request and retry', async () => {
    const keys: unknown[] = []
    const adapter: AxiosAdapter = async (config) => {
      keys.push(config.headers.get('X-Request-Id'))
      if (keys.length === 1) throw new Error('transport failure')
      return { config, data: { code: 0, data: {} }, status: 200, statusText: 'OK', headers: {} }
    }
    const config = {
      url: '/tasks/execute',
      method: 'POST',
      headers: { 'X-Request-Id': 'existing-operation-key' },
      adapter,
      silent: true,
    }
    await expect(send(config)).rejects.toThrow('transport failure')
    await send(config)
    expect(keys).toEqual(['existing-operation-key', 'existing-operation-key'])
  })
})
