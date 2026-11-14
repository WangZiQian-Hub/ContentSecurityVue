// Browser regression: exports actual page PNGs without any backend export task.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const base = process.env.SNAPSHOT_TEST_URL || 'http://127.0.0.1:1247'
const out = process.env.SNAPSHOT_OUTPUT_DIR || path.resolve('docs/page-snapshot-verification')

;(async () => {
  fs.mkdirSync(out, { recursive: true })
  let browser, server
  try {
    if (process.env.SNAPSHOT_START_SERVER === '1') {
      server = spawn(
        process.execPath,
        [
          path.resolve('node_modules/vite/bin/vite.js'),
          '--host',
          '127.0.0.1',
          '--port',
          new URL(base).port,
          '--strictPort',
        ],
        { windowsHide: true, stdio: 'ignore' },
      )
      let ready = false
      for (let i = 0; i < 60; i++) {
        try {
          if ((await fetch(base)).ok) {
            ready = true
            break
          }
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
      assert.ok(ready, 'Isolated Vite server did not start')
    }
    browser = await chromium.launch({ headless: true, channel: 'msedge' })
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      acceptDownloads: true,
    })
    const errors = [],
      exportRequests = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/api/v1/**', (route) => {
      if (route.request().url().includes('/tasks/execute'))
        exportRequests.push(route.request().url())
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 503, message: 'Isolated snapshot check', data: null }),
      })
    })
    await page.addInitScript(() => sessionStorage.setItem('accessToken', 'snapshot-local-check'))
    for (const view of ['execution', 'statistics', 'tools', 'ingest']) {
      await page.goto(`${base}/compliance/agent-traces?view=${view}`)
      const toggle = page.locator('.compliance-mode .el-switch')
      await toggle.waitFor()
      if (!(await toggle.getAttribute('class')).includes('is-checked')) await toggle.click()
      const button = page.getByRole('button', { name: '导出当前视图', exact: true })
      await page.waitForFunction(() => {
        const b = [...document.querySelectorAll('.at-heading button')].find((b) =>
          b.textContent.includes('导出当前视图'),
        )
        return b && !b.disabled
      })
      await page.waitForTimeout(500)
      await page.locator('.agent-traces').screenshot({ path: path.join(out, `${view}-before.png`) })
      const download = page.waitForEvent('download')
      await button.click()
      const file = await download
      const target = path.join(out, `${view}-snapshot.png`)
      await file.saveAs(target)
      const bytes = fs.readFileSync(target)
      assert.equal(bytes.subarray(1, 4).toString(), 'PNG')
      assert.ok(bytes.readUInt32BE(16) > 1000, 'Expected full-width page image')
      assert.ok(bytes.length > 50000, 'Expected actual page graphics, not an empty image')
      await page
        .locator('.page-snapshot-status')
        .getByText('页面快照已生成，已自动发起下载')
        .waitFor()
      console.log(
        `${view}: ${bytes.readUInt32BE(16)} x ${bytes.readUInt32BE(20)}, ${bytes.length} bytes`,
      )
    }
    // Mutating the live page after capture starts must not alter the PNG.
    const frozen = await page.evaluate(async () => {
      const { tracePagePng } = await import('/src/utils/agent-trace-export.ts')
      const fixture = document.createElement('div')
      fixture.style.cssText = 'width:200px;height:120px;background:rgb(255,0,0)'
      document.body.appendChild(fixture)
      const pending = tracePagePng(fixture)
      fixture.style.background = 'rgb(0,0,255)'
      const blob = await pending
      const bitmap = await createImageBitmap(blob)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(bitmap, 0, 0)
      const pixel = [...ctx.getImageData(80, 80, 1, 1).data]
      fixture.remove()
      bitmap.close()
      return pixel
    })
    assert.deepEqual(frozen, [255, 0, 0, 255], 'PNG must preserve the click-time red frame')
    assert.deepEqual(exportRequests, [], 'Page export must not request a backend text report')
    assert.deepEqual(errors, [], 'No browser runtime errors')
    console.log(
      'Passed: four page exports, full-height PNG, frozen click-time appearance, no backend export requests.',
    )
  } finally {
    await browser?.close()
    server?.kill()
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
