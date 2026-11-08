const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { spawn } = require('node:child_process')
const fs = require('node:fs'),
  assert = require('node:assert/strict')
const { setTimeout: delay } = require('node:timers/promises')
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '1227', '--strictPort'],
  {
    windowsHide: true,
    stdio: 'ignore',
    env: { ...process.env, VITE_USE_MOCK: 'true', VITE_COMPLIANCE_DEMO: 'true' },
  },
)
process.on('exit', () => server.kill())
;(async () => {
  for (let i = 0; i < 50; i++) {
    try {
      await globalThis.fetch('http://127.0.0.1:1227')
      break
    } catch {
      await delay(200)
    }
  }
  const browser = await chromium.launch({ headless: true, channel: 'msedge' }),
    page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      acceptDownloads: true,
    }),
    errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(
    'http://127.0.0.1:1227/compliance/agent-traces?view=statistics&batchId=mock_batch_demo&snapshotId=mock_snapshot_1&projectionVersion=stats_1&language=all&listFilter=all&page=1',
  )
  await page.locator('.ats-kpis strong').first().waitFor()
  assert.deepEqual(await page.locator('.ats-kpis strong').allTextContents(), [
    '200',
    '128',
    '248,600',
    '1.58',
    '486',
    '8',
    '14.2',
    '86%',
  ])
  fs.mkdirSync('docs/agent-trace-statistics-reference-verification', { recursive: true })
  await page.locator('.ats-chart canvas').first().waitFor()
  await page.screenshot({
    path: 'docs/agent-trace-statistics-reference-verification/overview.png',
    fullPage: true,
  })

  await page
    .locator('.at-heading')
    .getByRole('button', { name: '导出当前视图', exact: true })
    .click()
  const banner = page.locator('.ats-export-status')
  await banner.waitFor()
  assert.equal(await page.getByRole('dialog', { name: '导出当前视图', exact: true }).count(), 0)
  const button = banner.getByRole('button', { name: /下载 .*view\.png/ })
  await button.waitFor({ timeout: 30000 })
  assert.match(await banner.innerText(), /导出任务 · succeeded · mock_batch_demo/)
  await page.screenshot({
    path: 'docs/agent-trace-statistics-reference-verification/inline-export.png',
    fullPage: true,
  })
  await page.waitForURL('**/compliance/agent-traces?view=statistics')
  assert.equal(new URL(page.url()).search, '?view=statistics')
  const download = page.waitForEvent('download')
  await button.click()
  await (await download).saveAs('docs/agent-trace-statistics-reference-verification/view.png')
  assert.equal(
    fs
      .readFileSync('docs/agent-trace-statistics-reference-verification/view.png')
      .subarray(1, 4)
      .toString(),
    'PNG',
  )
  await page.getByRole('button', { name: /检出风险（128）/ }).click()
  await page.locator('.ats-pagination .btn-next').click()
  await page.waitForFunction(() =>
    document.querySelector('.ats-pagination')?.textContent?.includes('2/22'),
  )
  assert.equal(new URL(page.url()).search, '?view=statistics')
  await page.getByRole('button', { name: '查看 JSON →', exact: true }).first().click()
  await page.locator('.ats-json-drawer').getByText('完整结构', { exact: false }).waitFor()
  await page.screenshot({ path: 'docs/agent-trace-statistics-reference-verification/drawer.png' })
  assert.equal(new URL(page.url()).search, '?view=statistics')
  assert.deepEqual(errors, [])
  fs.writeFileSync(
    'docs/agent-trace-statistics-reference-verification/result.json',
    JSON.stringify(
      {
        passed: true,
        checks: [
          'reference KPI totals',
          'inline task status below tabs with manual PNG download and no modal',
          'reference drawer',
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
  process.exit(1)
})
