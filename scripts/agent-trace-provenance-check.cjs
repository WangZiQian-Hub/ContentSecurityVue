// Run against an isolated Vite server. API calls are blocked; no live records are changed.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const base = process.env.PROVENANCE_TEST_URL || 'http://127.0.0.1:1236'
const out = process.env.PROVENANCE_OUTPUT_DIR || path.resolve('docs/risk-provenance-verification')
;(async () => {
  fs.mkdirSync(out, { recursive: true })
  let browser, server
  try {
    if (process.env.PROVENANCE_START_SERVER === '1') {
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
      for (let i = 0; i < 40; i++) {
        try {
          if ((await fetch(base)).ok) {
            ready = true
            break
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 250))
      }
      assert.ok(ready, 'Isolated Vite server did not start')
    }
    browser = await chromium.launch({ headless: true, channel: 'msedge' })
    const page = await browser.newPage({ viewport: { width: 1920, height: 1250 } })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.route('**/api/v1/**', (r) =>
      r.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 503, message: '隔离演示验收，未连接真实接口', data: null }),
      }),
    )
    await page.addInitScript(() => sessionStorage.setItem('accessToken', 'local-demo-verification'))
    await page.goto(base + '/compliance/agent-traces?view=execution')
    const toggle = page.locator('.compliance-mode .el-switch')
    await toggle.waitFor()
    if (!(await toggle.getAttribute('class')).includes('is-checked')) await toggle.click()
    const panel = page.locator('.ex-provenance')
    const help = page.getByRole('button', { name: '说明：原始来源内容', exact: true })
    await help.hover()
    const helpTable = page.getByRole('table', { name: '步骤内容说明', exact: true })
    await helpTable.waitFor()
    assert.equal(await helpTable.locator('tbody tr').count(), 5)
    assert.match(await helpTable.innerText(), /工具返回\s+工具实际返回的结果/)
    await page.locator('.execution-content-help').screenshot({ path: path.join(out, 'step-content-help.png'), animations: 'disabled' })
    await page.mouse.move(0, 0)
    await helpTable.waitFor({ state: 'hidden' })
    await panel.getByRole('button', { name: '定位 STEP-12 越权调用' }).waitFor()
    assert.equal(await panel.locator('.provenance-node').count(), 4)
    assert.equal(await panel.locator('.provenance-edge.candidate').count(), 2)
    assert.equal(await panel.locator('.provenance-edge.recorded').count(), 1)
    assert.equal(await panel.locator('.provenance-select,.provenance-status,.provenance-evidence').count(), 0)
    await panel.locator('.provenance-edge.candidate').first().hover()
    await page.getByRole('tooltip')
      .getByText('两段内容提到了相同的操作，但还不能确定前一段是否影响了后续行为。', {
        exact: true,
      })
      .waitFor()
    await panel.getByRole('button', { name: '定位 STEP-12 越权调用' }).click()
    await page.locator('.ex-log tr.selected').filter({ hasText: 'STEP-12' }).waitFor()
    assert.equal(await page.getByRole('dialog', { name: '节点详情', exact: true }).count(), 0)
    await panel.getByText('记录出处', { exact: true }).click()
    await panel.getByText('这里显示当前步骤来自哪份原始记录。').waitFor()
    await panel.getByText('风险溯源', { exact: true }).click()
    await panel.screenshot({ path: path.join(out, 'risk-chain.png') })
    await page.screenshot({ path: path.join(out, 'desktop.png'), fullPage: true })
    for (const width of [1440, 1000, 760]) {
      await page.setViewportSize({ width, height: 1050 })
      await page.waitForTimeout(250)
      await page.screenshot({ path: path.join(out, `width-${width}.png`), fullPage: true })
      assert.ok(
        await panel.evaluate((el) => el.scrollHeight <= el.clientHeight + 4),
        `Risk panel clips content at width ${width}`,
      )
    }
    // A no-risk sample must not inherit the previous sample's chain.
    await page.goto(
      base + '/compliance/agent-traces?view=execution&batchId=mock_batch_demo&traceId=mock_trace_8',
    )
    await toggle.waitFor()
    if (!(await toggle.getAttribute('class')).includes('is-checked')) await toggle.click()
    await page.locator('.ex-provenance .provenance-empty').waitFor()
    assert.equal(await page.locator('.ex-provenance .provenance-node').count(), 0)
    assert.deepEqual(errors, [])
    console.log(
      'Passed: risk paths, relationship evidence, node/log location, source mode, 4 widths, no-risk reset; no runtime errors.',
    )
  } finally {
    await browser?.close()
    server?.kill()
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
