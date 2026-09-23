const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const fs = require('node:fs')
;(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' })
  const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('http://127.0.0.1:5173/')
  await page.locator('.core-chain').waitFor()
  await page.screenshot({ path: 'docs/dashboard-preview.png', fullPage: true })
  const links = await page.locator('.sidebar nav a').evaluateAll((elements) =>
    elements.map((element) => ({
      href: element.getAttribute('href'),
      title: element.textContent.trim(),
    })),
  )
  let tabCount = 0
  for (const link of links) {
    await page.locator(`.sidebar nav a[href="${link.href}"]`).click()
    await page.waitForFunction(
      (title) => document.querySelector('h1')?.textContent === title,
      link.title,
    )
    const tabs = await page
      .locator('.page-tabs a')
      .evaluateAll((elements) => elements.map((element) => element.getAttribute('href')))
    for (const href of tabs) {
      await page.locator(`.page-tabs a[href="${href}"]`).click()
      await page.waitForFunction((path) => location.pathname === path, href)
      tabCount++
    }
  }
  await page.goto('http://127.0.0.1:5173/model-train/invoke')
  await page.getByRole('button', { name: '开始调用', exact: true }).click()
  await page.locator('.result-box b').filter({ hasText: '模拟调用完成' }).waitFor()
  await page.getByRole('button', { name: /当前任务/ }).click()
  await page.getByRole('heading', { name: '当前任务', exact: true }).waitFor()
  await page.locator('.el-drawer:visible .el-drawer__close-btn').first().click()
  await page.getByRole('button', { name: '系统消息', exact: true }).click()
  await page.getByRole('button', { name: '全部标记已读' }).click()
  await page.locator('.el-drawer:visible .el-drawer__close-btn').first().click()
  await page.getByPlaceholder('搜索功能、数据、任务等…').fill('数据资源')
  await page.getByRole('option').first().click()
  await page.waitForURL('**/data-resource')
  await page.goto('http://127.0.0.1:5173/compliance/neuron-audit')
  await page.locator('canvas').first().waitFor()
  await page.screenshot({ path: 'docs/compliance-preview.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://127.0.0.1:5173/dashboard')
  await page.locator('.core-chain').waitFor()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  if (overflow) errors.push('Mobile horizontal overflow')
  await page.screenshot({ path: 'docs/mobile-preview.png', fullPage: true })
  fs.writeFileSync(
    'docs/browser-check.json',
    JSON.stringify(
      {
        primaryPages: links.length,
        secondaryRoutes: tabCount,
        errors,
        checked: [
          'navigation',
          'nested routes',
          'mock invocation',
          'task drawer',
          'notifications',
          'global search',
          'mobile layout',
        ],
      },
      null,
      2,
    ),
  )
  await browser.close()
  console.log(JSON.stringify({ primaryPages: links.length, secondaryRoutes: tabCount, errors }))
  if (errors.length) process.exitCode = 1
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
