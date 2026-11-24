import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const backend = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('./request', () => backend)

describe('Docker model-service token', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_GOVERNANCE_BACKEND', 'llm')
    vi.stubEnv('VITE_DOCKER_LLM_AUTO_TOKEN', 'true')
    vi.stubEnv('VITE_LLM_ACCESS_TOKEN', '')
    const entries = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    })
    backend.request.mockReset().mockResolvedValue({
      token: 'issued-for-this-session',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('obtains and saves one token for concurrent calls after login', async () => {
    const llm = await import('./governance-llm')
    await llm.ensureDockerLlmToken()
    expect(backend.request).not.toHaveBeenCalled()
    sessionStorage.setItem('accessToken', 'platform-session')
    await Promise.all([llm.ensureDockerLlmToken(), llm.ensureDockerLlmToken()])
    expect(backend.request).toHaveBeenCalledTimes(1)
    expect(llm.getLlmToken()).toBe('issued-for-this-session')
    expect(llm.llmTokenConfigured.value).toBe(true)
    llm.clearDockerLlmToken()
    expect(llm.getLlmToken()).toBe('')
  })

  it('does not overwrite a manually configured token or request one for a reader', async () => {
    const llm = await import('./governance-llm')
    sessionStorage.setItem('accessToken', 'platform-session')
    sessionStorage.setItem('authUser', '{"tier":"reader"}')
    await llm.ensureDockerLlmToken()
    expect(backend.request).not.toHaveBeenCalled()
    llm.saveLlmToken('manual-token')
    llm.clearDockerLlmToken()
    expect(llm.getLlmToken()).toBe('manual-token')
  })
})
