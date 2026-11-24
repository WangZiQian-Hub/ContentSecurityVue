import { webcrypto } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUuid } from './uuid'

afterEach(() => vi.unstubAllGlobals())

describe('createUuid', () => {
  it('uses native UUID with its crypto receiver', () => {
    const crypto = {
      randomUUID() {
        expect(this).toBe(crypto)
        return '9bd630fe-1804-44b7-9dc6-e63971fc44c7'
      },
      getRandomValues: vi.fn(),
    }
    vi.stubGlobal('crypto', crypto)
    expect(createUuid()).toBe('9bd630fe-1804-44b7-9dc6-e63971fc44c7')
    expect(crypto.getRandomValues).not.toHaveBeenCalled()
  })

  it('sets version and variant bits using secure random bytes', () => {
    vi.stubGlobal('crypto', {
      getRandomValues(bytes: Uint8Array) {
        bytes.fill(255)
        return bytes
      },
    })
    expect(createUuid()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff')
  })

  it('generates distinct v4 UUIDs without randomUUID', () => {
    vi.stubGlobal('crypto', { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) })
    const ids = Array.from({ length: 2000 }, createUuid)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids)
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it.each([undefined, {}])(
    'explains missing secure randomness without mutating globals',
    (crypto) => {
      vi.stubGlobal('crypto', crypto)
      expect(createUuid).toThrow('当前浏览器不支持安全随机数生成')
      expect(globalThis.crypto).toBe(crypto)
    },
  )
})
