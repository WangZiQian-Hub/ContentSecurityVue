const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const fs = require('node:fs')
const { Buffer } = require('node:buffer')
const assert = require('node:assert/strict')
const { setTimeout: delay } = require('node:timers/promises')
const { spawn } = require('node:child_process')
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '1225', '--strictPort'],
  {
    windowsHide: true,
    stdio: 'ignore',
    env: { ...process.env, VITE_USE_MOCK: 'true', VITE_COMPLIANCE_DEMO: 'false' },
  },
)
process.on('exit', () => server.kill())
;(async () => {
  const dir = 'docs/agent-traces-verification'
  fs.mkdirSync(dir, { recursive: true })
  const browser = await chromium.launch({ headless: true, channel: 'msedge' })
  const page = await browser.newPage({
    viewport: { width: 1680, height: 1100 },
    acceptDownloads: true,
  })
  const errors = []
  for (let i = 0; i < 50; i++) {
    try {
      await globalThis.fetch('http://127.0.0.1:1225/')
      break
    } catch {
      await delay(200)
    }
  }
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route('**/api/v1/compliance/agent-traces/workspace*', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ code: 503, message: '测试：后端尚未接入', data: null }),
    }),
  )
  await page.goto('http://127.0.0.1:1225/compliance/agent-traces', {
    waitUntil: 'domcontentloaded',
  })
  const toggle = page.getByRole('switch', { name: '切换示例演示' })
  if ((await toggle.getAttribute('aria-checked')) !== 'true')
    await page.locator('.compliance-mode .el-switch').click()
  try {
    await page.locator('.at-code').first().waitFor({ timeout: 8000 })
  } catch (error) {
    await page.screenshot({ path: dir + '/mode-switch-failure.png', fullPage: true })
    throw error
  }
  await page.screenshot({ path: dir + '/desktop.png', fullPage: true })
  assert.equal(await page.locator('.at-format').count(), 3)
  assert.equal(await page.getByRole('button', { name: '新建批次', exact: true }).count(), 0)
  assert.equal(await page.getByPlaceholder('检索样本编号').count(), 0)
  assert.equal(await page.locator('.at-event-select').count(), 0)
  assert.equal(await page.getByText(/当前调用片段 · 完整轨迹/).count(), 0)
  // Mode changes must not remount a second owner of the same Pinia state.
  for (let i = 0; i < 3; i++) {
    await page.locator('.compliance-mode .el-switch').click()
    await page.locator('.agent-traces .el-alert').first().waitFor()
    assert.equal(await page.locator('.at-format').count(), 0)
    await page.locator('.compliance-mode .el-switch').click()
    await page.locator('.at-code').first().waitFor()
    assert.equal(await page.locator('.at-format').count(), 3)
  }
  await page.getByRole('button', { name: '下一条 →', exact: true }).click()
  await page.getByText('AUD-0043', { exact: true }).first().waitFor()
  await page.locator('.at-issue').first().getByRole('button', { name: '定位样本 →' }).click()
  await page.locator('.at-list-controls .el-tag').waitFor()
  await page.getByRole('button', { name: '查看执行路径 →' }).click()
  await page.locator('.at-preview-grid .el-table').first().waitFor()
  await page.getByPlaceholder('检索样本编号').waitFor()
  await page.locator('.at-event-select').waitFor()
  await page.getByRole('button', { name: '轨迹接入与校验', exact: true }).click()
  await page.getByRole('button', { name: '导出结果包', exact: true }).click()
  await page.getByRole('button', { name: '生成并下载 ZIP' }).click()
  const downloadButton = page.getByRole('button', { name: '下载 agent-trace-results.zip' })
  await downloadButton.waitFor()
  const downloadPromise = page.waitForEvent('download')
  await downloadButton.click()
  const download = await downloadPromise
  await download.saveAs(dir + '/results.zip')
  await page.setViewportSize({ width: 900, height: 1100 })
  await page.screenshot({ path: dir + '/narrow.png', fullPage: true })
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
  )
  await page.locator('input[type=file]').setInputFiles({
    name: 'uploaded.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] })),
  })
  await page.locator('.at-file').filter({ hasText: 'uploaded.json' }).waitFor()
  await page.getByRole('button', { name: '开始解析', exact: true }).click()
  await page.locator('.at-task').filter({ hasText: 'succeeded' }).waitFor()
  await page.getByRole('button', { name: '导出当前视图', exact: true }).click()
  const pngButton = page.getByRole('button', { name: '下载 agent-trace-view.png' })
  await pngButton.waitFor()
  const pngPromise = page.waitForEvent('download')
  await pngButton.click()
  await (await pngPromise).saveAs(dir + '/view.png')
  assert.deepEqual(errors, [])
  fs.writeFileSync(
    dir + '/result.json',
    JSON.stringify(
      {
        passed: true,
        errors,
        checks: [
          'three formats',
          'HTTP-first startup then switch to demo',
          'three HTTP/demo round trips recover content',
          'next sample',
          'issue location',
          'execution navigation',
          'real ZIP download',
          '900px layout',
          'ingest marked controls removed; execution controls preserved',
          'upload into selected batch',
          'parse uploaded JSON',
          'PNG export',
        ],
      },
      null,
      2,
    ),
  )
  await browser.close()
  server.kill()
})().catch((e) => {
  console.error(e)
  server.kill()
  process.exit(1)
  process.exitCode = 1
})
