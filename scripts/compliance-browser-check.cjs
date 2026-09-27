const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const fs = require('node:fs')
const assert = require('node:assert/strict')
;(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' })
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  const errors = [],
    checks = [],
    screenshots = []
  page.on('pageerror', (e) => errors.push(e.message))
  const root = process.env.COMPLIANCE_BASE_URL || 'http://127.0.0.1:5173'
  const dir = 'docs/compliance-verification'
  const routes = [
    ['overview', ''],
    ['lineage', '/lineage?sourceId=demo_model_20260921_0024&versionId=v1.4.0'],
    ['training-monitor', '/training-monitor?trainingTaskId=demo_training_20260921_2408'],
    [
      'reasoning-audit',
      '/reasoning-audit?taskId=demo_call_20260927_9081&traceId=demo_trace_20260927_0017',
    ],
    [
      'neuron-audit',
      '/neuron-audit?modelId=demo_model_20260921_0024&versionId=v1.4.0&captureId=demo_capture_20260927_0118',
    ],
    ['risk-alert', '/risk-alert?alertId=demo_alert_20260921_2309'],
    ['full-chain', '/full-chain?taskId=demo_call_20260927_9081&traceId=demo_trace_20260927_0017'],
  ]
  async function demo() {
    const toggle = page.getByRole('switch', { name: '切换示例演示' })
    if ((await toggle.getAttribute('aria-checked')) !== 'true')
      await page.locator('.compliance-mode .el-switch').click()
    await page.locator('.compliance-content[aria-busy="false"]').waitFor()
    await page
      .locator('.el-loading-mask')
      .waitFor({ state: 'hidden' })
      .catch(() => {})
  }
  async function visit(path) {
    await page.goto(root + '/compliance' + path)
    await demo()
  }
  async function shot(name) {
    await page.waitForFunction(() => !document.querySelector('.el-message'))
    await page.waitForTimeout(350)
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true, animations: 'disabled' })
    screenshots.push(`${name}.png`)
  }
  for (const width of [1920, 1366]) {
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 900 })
    for (const [name, path] of routes) {
      await visit(path)
      await page.locator('.compliance-workspace .panel').first().waitFor()
      assert.equal(await page.locator('.compliance-tabs a').count(), 7)
      assert.equal(await page.locator('.page-tabs').count(), 0)
      assert.equal(await page.getByText('业务能力入口', { exact: true }).count(), 0)
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
        `${width}/${name} overflow`,
      )
      await shot(`${name}-${width}`)
      if (
        await page.locator('.main-content').evaluate((el) => el.scrollHeight > el.clientHeight + 10)
      ) {
        await page.locator('.main-content').evaluate((el) => el.scrollTo(0, el.scrollHeight))
        await shot(`${name}-${width}-lower`)
      }
    }
  }
  checks.push('7 independent routes at 1920 and 1366; no page horizontal overflow; isolated shell')
  await page.setViewportSize({ width: 1920, height: 1080 })
  await visit(routes[1][1])
  await page.getByRole('button', { name: 'dsv_000031 → TRAIN-2408', exact: true }).click()
  await page.getByText('CP-12 未写入 snapshot_ref', { exact: true }).first().waitFor()
  assert.equal(await page.locator('.compliance-selected-row').count(), 1)
  await page.getByRole('button', { name: '放大关系图' }).click()
  checks.push('lineage edge/table selection and zoom')
  await visit(routes[4][1])
  assert.equal(await page.locator('.compliance-heatmap button').count(), 192)
  assert.equal(await page.locator('.compliance-heatmap button.abnormal').count(), 3)
  await page.getByRole('button', { name: 'L8 / 106', exact: true }).click()
  await page.getByRole('heading', { name: '源证据详情' }).waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('heading', { name: '源证据详情' }).waitFor({ state: 'hidden' })
  assert.equal(await page.locator('.compliance-heatmap button.selected').count(), 1)
  checks.push('heatmap coordinates, drawer, ESC')
  await visit(routes[6][1])
  await page
    .locator('.el-table__row')
    .filter({ hasText: '训练过程' })
    .getByRole('button', { name: '查看源证据' })
    .click()
  await page.getByRole('heading', { name: '源证据详情' }).waitFor()
  await shot('evidence-detail-1920')
  await page.keyboard.press('Escape')
  await visit(routes[5][1])
  await page.getByRole('button', { name: '认领事件', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '认领事件', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '提交复核', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: '提交复核并关闭' }).isDisabled(), true)
  await shot('alert-review-state-1920')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '下一页' }).click()
  await page.getByRole('button', { name: 'ALT-2304', exact: true }).waitFor()
  checks.push('claim confirmation, missing evidence blocks close, pagination')
  await page
    .locator('.el-select')
    .filter({ has: page.getByRole('combobox', { name: '风险等级' }) })
    .click()
  await page.getByRole('option', { name: '高风险', exact: true }).click()
  await page.getByRole('button', { name: 'ALT-2309', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'ALT-2304', exact: true }).count(), 0)
  await page.getByText('选择事件查看详情', { exact: true }).waitFor()
  checks.push('risk filter clears stale detail and resets pagination')
  const readPosts = []
  const observeRead = (request) => {
    if (request.method() === 'POST' && request.url().includes('/api/v1/'))
      readPosts.push(request.url())
  }
  page.on('request', observeRead)
  for (const [name] of routes) {
    const path = name === 'overview' ? '/compliance' : `/compliance/${name}`
    await page.locator(`.compliance-tabs a[href="${path}"]`).click()
    await page.locator('.compliance-content[aria-busy="false"]').waitFor()
  }
  page.off('request', observeRead)
  assert.deepEqual(readPosts, [])
  checks.push('same-session switching across all seven tabs never executes POST')
  await visit('/training-monitor?trainingTaskId=TR-0925-012')
  await page.getByText('暂无匹配的训练审计结果，请选择训练任务或审计记录').waitFor()
  await visit('/full-chain?taskId=demo_call_20260927_9081&traceId=wrong')
  await page.getByText('调用记录与 Trace 指向不同对象，请核对来源。').waitFor()
  assert.equal(await page.getByText('整链核验结论', { exact: true }).count(), 0)
  await visit('/neuron-audit?modelId=mdl-2')
  assert.equal(await page.locator('.compliance-heatmap').count(), 0)
  checks.push(
    'existing inbound training/model without invented audits; conflicting call/trace has no result',
  )
  await page.goto(root + '/compliance')
  if (
    (await page.getByRole('switch', { name: '切换示例演示' }).getAttribute('aria-checked')) ===
    'true'
  )
    await page.locator('.compliance-mode .el-switch').click()
  await page.locator('.compliance-workspace .el-alert--error').first().waitFor()
  assert.equal(
    await page.getByRole('switch', { name: '切换示例演示' }).getAttribute('aria-checked'),
    'false',
  )
  assert.equal(await page.locator('.compliance-kpis').count(), 0)
  await shot('online-error-1920')
  checks.push('actual HTTP unavailable stays error, no fallback')
  for (const path of [
    '/dashboard',
    '/data-resource',
    '/data-governance/process',
    '/model-train/training',
    '/evaluation',
    '/scenario',
    '/system',
  ]) {
    await page.goto(root + path)
    await page.locator('.sidebar nav a').first().waitFor()
    assert.equal(await page.locator('.sidebar nav a').count(), 8)
    assert.equal(await page.locator('.compliance-tabs').count(), 0)
  }
  checks.push('8 primary menus retained; non-compliance routes smoke checked')
  fs.writeFileSync(
    `${dir}/browser-check.json`,
    JSON.stringify({ checks, screenshots, errors, backendIntegration: false }, null, 2),
  )
  fs.writeFileSync(
    `${dir}/screenshots.html`,
    `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>全链路合规治理 · 实现截图</title>
<style>body{font:16px system-ui;background:#eff5fc;color:#17365f;margin:32px}nav{display:flex;gap:12px;flex-wrap:wrap}a{color:#1767dc}section{margin:32px 0;padding:18px;background:white;border-radius:12px}img{max-width:100%;height:auto;border:1px solid #dce7f5}h2{font-size:18px}p{line-height:1.8}</style>
<header><h1>全链路合规治理 · 实现截图</h1><p>真实浏览器截图，视口 1920×1080 与 1366×900。业务展示采用显式示例模式；online-error 展示真实 HTTP 请求失败。lower 为实际滚动内容区后的截图。后端尚未联调。</p><p><a href="README.md">验收说明</a> · <a href="../compliance-api-contract.md">接口契约</a></p><nav>${screenshots.map((name) => `<a href="#${name}">${name}</a>`).join('')}</nav></header>
${screenshots.map((name) => `<section id="${name}"><h2>${name}</h2><a href="${name}"><img loading="lazy" src="${name}" alt="${name}"></a></section>`).join('\n')}</html>`,
    'utf8',
  )
  await browser.close()
  console.log(JSON.stringify({ checks, errors }))
  if (errors.length) process.exitCode = 1
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
