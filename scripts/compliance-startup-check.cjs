const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { URL } = require('node:url')
;(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' })
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
    const root = process.env.COMPLIANCE_BASE_URL || 'http://127.0.0.1:5174'
    const errors = [],
      requests = [],
      checked = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('request', (request) => {
      if (request.url().includes('/api/v1/compliance/')) requests.push(request.url())
    })
    await page.goto(root + '/compliance')
    await page.locator('.compliance-kpis').waitFor()
    assert.equal(await page.getByRole('switch').getAttribute('aria-checked'), 'true')
    assert.equal(requests.length, 0, 'Default preview must not request absent compliance backend')
    await page.screenshot({ path: 'docs/compliance-verification/startup-demo-5174.png' })
    const navigation = await page.evaluate(
      async () => (await import('/src/router/navigation.ts')).navigation,
    )
    for (const item of navigation) {
      for (const path of [item.path, ...item.tabs.map((tab) => `${item.path}/${tab.path}`)]) {
        await page.goto(root + path)
        await page.waitForFunction(() => {
          const content = document.querySelector('.main-content')
          return (
            content &&
            (content.querySelector('.panel, .el-card, canvas, .el-empty') ||
              content.querySelectorAll('button, td, input').length > 5)
          )
        })
        await page.waitForTimeout(150)
        assert.equal(await page.locator('.sidebar nav a').count(), 8)
        checked.push({ path, actualPath: new URL(page.url()).pathname })
        console.log(path)
      }
    }
    assert.deepEqual(errors, [])
    fs.writeFileSync(
      'docs/compliance-verification/startup-check.json',
      JSON.stringify({ root, checked, errors, defaultDemo: true }, null, 2),
    )
    console.log(JSON.stringify({ checked: checked.length, errors, defaultDemo: true }))
  } finally {
    await browser.close()
  }
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
