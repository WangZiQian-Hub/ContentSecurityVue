import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { navigation } from '../../router/navigation'
describe('protected module regression boundary', () => {
  it('keeps every initially protected source file byte-for-byte unchanged', () => {
    const entries = JSON.parse(
      readFileSync('docs/compliance-verification/protected-hashes.json', 'utf8').replace(
        /^\uFEFF/,
        '',
      ),
    ) as { Path: string; Hash: string }[]
    for (const entry of entries)
      expect(
        createHash('sha256')
          .update(readFileSync(`src/${entry.Path.split('\\src\\')[1]!.replaceAll('\\', '/')}`))
          .digest('hex')
          .toUpperCase(),
        entry.Path,
      ).toBe(entry.Hash)
  })
  it('changes AppLayout only at the two compliance exclusion conditions', () => {
    const original = readFileSync('docs/compliance-verification/app-layout-before.vue.txt', 'utf8')
      .replace(/^\uFEFF/, '')
      .replaceAll('\r\n', '\n')
    const current = readFileSync('src/layouts/AppLayout.vue', 'utf8').replaceAll('\r\n', '\n')
    expect(current.replaceAll("'/model-train', '/compliance'", "'/model-train'")).toBe(original)
    expect(current.match(/'\/model-train', '\/compliance'/g)).toHaveLength(2)
    for (const item of navigation.filter((n) => n.path !== '/compliance'))
      expect(
        ['/data-resource', '/data-governance', '/model-train', '/compliance'].includes(item.path),
      ).toBe(['/data-resource', '/data-governance', '/model-train'].includes(item.path))
    expect(navigation).toHaveLength(8)
  })
})
