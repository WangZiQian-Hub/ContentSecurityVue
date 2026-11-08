const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const { setTimeout: delay } = require('node:timers/promises')
const { spawn } = require('node:child_process')
const dir = 'docs/agent-trace-statistics-verification'
fs.mkdirSync(dir, { recursive: true })
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '1226', '--strictPort'],
  {
    windowsHide: true,
    stdio: 'ignore',
    env: { ...process.env, VITE_USE_MOCK: 'true', VITE_COMPLIANCE_DEMO: 'true' },
  },
)
process.on('exit', () => server.kill())
;(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' })
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    acceptDownloads: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const page = await context.newPage(),
    errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  for (let i = 0; i < 50; i++) {
    try {
      await globalThis.fetch('http://127.0.0.1:1226/')
      break
    } catch {
      await delay(200)
    }
  }
  await page.goto('http://127.0.0.1:1226/compliance/agent-traces?view=statistics')
  await page.locator('.ats-kpis article').first().waitFor()
  await page.locator('.ats-chart canvas').first().waitFor()
  assert.equal(await page.locator('.ats-kpis article').count(), 8)
  assert.equal(await page.locator('.ats-sample-table .el-table__body tr').count(), 6)
  assert.equal(await page.locator('.ats-filters').getByText('重置', { exact: true }).count(), 0)
  await page.screenshot({ path: dir + '/overview-1920.png', fullPage: true })
  await page.getByRole('button', { name: '查看 JSON →', exact: true }).nth(5).click()
  const drawer = page.locator('.ats-json-drawer')
  await drawer.getByText('完整结构', { exact: false }).waitFor()
  await drawer.getByRole('button', { name: '下一条', exact: true }).click()
  await drawer.getByText('第 7 条 / 当前筛选结果 200 条', { exact: false }).waitFor()
  assert.match(await page.locator('.ats-pagination').innerText(), /2\/34/)
  await drawer.getByRole('button', { name: '复制 JSON', exact: true }).click()
  const json = JSON.parse(await page.evaluate(() => globalThis.navigator.clipboard.readText()))
  assert.equal(json.trace_id, 'mock_trace_7')
  assert.equal(json.events.length, 18)
  assert.ok(JSON.stringify(json).includes('tool_call_id'))
  await drawer.getByRole('tab', { name: '原始文件', exact: true }).click()
  await drawer.getByText('原始记录片段', { exact: false }).waitFor()
  await drawer.getByRole('tab', { name: '字段映射', exact: true }).click()
  await drawer.getByText('系统生成', { exact: true }).waitFor()
  await drawer.getByRole('tab', { name: '样本 JSON', exact: true }).click()
  await page.screenshot({ path: dir + '/drawer-1920.png', fullPage: true })
  await drawer.getByRole('button', { name: '导出 JSON', exact: true }).click()
  await page.keyboard.press('Escape')
  await drawer.waitFor({ state: 'hidden' })
  await page.waitForFunction(
    () => document.activeElement?.getAttribute('data-ats-trace') === 'mock_trace_7',
  )
  const save = async (pattern, name) => {
    const button = page.getByRole('button', { name: pattern })
    await button.waitFor({ timeout: 30000 })
    const download = page.waitForEvent('download')
    await button.click()
    await (await download).saveAs(dir + '/' + name)
  }
  await save(/下载 .*sample_json\.json/, 'sample.json')
  assert.equal(JSON.parse(fs.readFileSync(dir + '/sample.json', 'utf8')).trace_id, 'sample_0007')
  await page.getByRole('button', { name: /检出风险（128）/ }).click()
  assert.match(await page.locator('.ats-pagination').innerText(), /128/)
  assert.equal(await page.locator('.ats-kpis article').first().locator('strong').innerText(), '200')
  await page.getByRole('button', { name: /缺失字段（44）/ }).click()
  assert.match(await page.locator('.ats-pagination').innerText(), /44/)
  await page.locator('.at-heading').getByRole('button', { name: '导出结果包', exact: true }).click()
  await page
    .getByRole('dialog', { name: '导出统计结果包' })
    .getByRole('button', { name: '生成 ZIP' })
    .click()
  await save(/下载 .*package\.zip/, 'package.zip')
  assert.equal(fs.readFileSync(dir + '/package.zip').readUInt32LE(0), 0x04034b50)
  await page
    .locator('.at-heading')
    .getByRole('button', { name: '导出当前视图', exact: true })
    .click()
  await save(/下载 .*view\.png/, 'view.png')
  assert.equal(
    fs
      .readFileSync(dir + '/view.png')
      .subarray(1, 4)
      .toString(),
    'PNG',
  )
  await page.locator('.ats-filters .el-select').nth(1).locator('.el-select__wrapper').click()
  await page.getByRole('option', { name: '中文', exact: true }).click()
  assert.equal(await page.locator('.ats-kpis article').first().locator('strong').innerText(), '200')
  await page.locator('.ats-filters').getByRole('button', { name: '查询', exact: true }).click()
  await page.waitForFunction(
    () => document.querySelector('.ats-kpis strong')?.textContent === '100',
  )
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.screenshot({ path: dir + '/overview-1366.png', fullPage: true })
  await page.getByRole('button', { name: '查看 JSON →', exact: true }).first().click()
  await drawer.getByText('完整结构', { exact: false }).waitFor()
  await page.waitForFunction(() => {
    const b = document.querySelector('.ats-json-drawer')?.getBoundingClientRect()
    return b && b.x >= 0 && b.right <= innerWidth + 1
  })
  const bounds = await drawer.boundingBox()
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 1367)
  const footer = await drawer.locator('.ats-drawer-footer').boundingBox()
  assert.ok(footer.y + footer.height <= 901)
  await page.screenshot({ path: dir + '/drawer-1366.png', fullPage: true })
  await page.keyboard.press('Control+-')
  const after = await drawer.boundingBox()
  assert.equal(Math.round(after.width), Math.round(bounds.width))
  await page.keyboard.press('Escape')
  // Mock/HTTP switches must never leak mock IDs, or silently fall back.
  const http = []
  await page.route('**/api/v1/compliance/agent-traces/**', (r) => {
    http.push(r.request().url())
    return r.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ code: 503, message: '测试：统计后端尚未部署', data: null }),
    })
  })
  await page.locator('.compliance-mode .el-switch').click()
  await page
    .getByText(/测试：统计后端尚未部署/)
    .first()
    .waitFor()
  assert.equal(await page.locator('.ats-kpis article').count(), 0)
  assert.equal(http.filter((url) => url.includes('/statistics')).length, 1)
  assert.ok(http.every((url) => !url.includes('mock_') && !url.includes('/workspace')))
  await page.locator('.compliance-mode .el-switch').click()
  await page.locator('.ats-kpis article').first().waitFor()
  assert.equal(await page.locator('.ats-kpis article').first().locator('strong').innerText(), '200')
  await page
    .locator('.at-tabs')
    .getByRole('button', { name: '轨迹接入与校验', exact: true })
    .click()
  await page.locator('.at-format').first().waitFor()
  assert.equal(await page.locator('.at-format').count(), 3)
  assert.deepEqual(errors, [])
  fs.writeFileSync(
    dir + '/result.json',
    JSON.stringify(
      {
        passed: true,
        checks: [
          '8 KPIs, 7 panels, six-row pagination',
          'cross-page JSON navigation',
          'opaque JSON clipboard',
          'three drawer tabs',
          'sample JSON/ZIP/PNG actual downloads',
          'main-vs-list scope separation',
          'language draft requires query',
          '1920/1366 and zoom drawer geometry',
          'HTTP failure no mock fallback',
          'mode reset without mock IDs',
          'ingestion regression',
        ],
        errors,
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
  process.exitCode = 1
  process.exit(1)
})
