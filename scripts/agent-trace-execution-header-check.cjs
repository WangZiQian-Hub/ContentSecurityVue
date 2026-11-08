const { chromium } = require('C:/Users/29504/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const output = 'docs/agent-trace-execution-verification'
fs.mkdirSync(output, { recursive: true })
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1950, height: 1326 } })
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    // Isolated browser session: never authenticate the demo token against the backend.
    await page.route('**/api/v1/**', route => route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:503,message:'Mock-only visual verification',data:null})}))
    await page.addInitScript(() => sessionStorage.setItem('accessToken','local-demo-verification'))
    await page.goto('http://127.0.0.1:1223/compliance/agent-traces?view=execution&batchId=mock_batch_demo')
    await page.locator('.at-execution').waitFor()
    await page.locator('.compliance-mode .el-switch').evaluate(el => { if (!el.classList.contains('is-checked')) el.click() })
    await page.locator('.ex-sample').first().waitFor()
    await page.locator('.path-scroll > svg > g').first().waitFor()
    await page.waitForTimeout(400) // Element Plus loading-mask exit transition.
    // Entry shows the default batch without any query-button click.
    assert.equal(await page.locator('.ex-sample').count(),6)
    assert.equal(await page.locator('.path-scroll > svg > g').count(),18)
    await page.locator('.ex-query .el-select').click()
    await page.getByRole('option',{name:'空批次',exact:true}).click()
    assert.equal(await page.locator('.ex-sample').count(),6)
    assert.match(await page.locator('.ex-result').innerText(),/AUD-2026-001/)
    await page.getByRole('button',{name:'查询',exact:true}).click()
    await page.waitForFunction(()=>document.querySelector('.ex-result')?.textContent.includes('样本规模 0'))
    assert.equal(await page.locator('.ex-sample').count(),0)
    await page.locator('.ex-query .el-select').click()
    await page.getByRole('option',{name:'AUD-2026-001',exact:true}).click()
    assert.equal(await page.locator('.ex-sample').count(),0)
    await page.getByRole('button',{name:'查询',exact:true}).click()
    await page.locator('.path-scroll > svg > g').first().waitFor()
    await page.waitForTimeout(400)
    assert.equal(await page.locator('.ex-demo-marker').count(),0)
    assert.equal(await page.locator('.at-heading').getByText('演示数据',{exact:true}).count(),0)
    assert.equal(await page.locator('.at-heading h1').evaluate(el => getComputedStyle(el,'::after').content),'none')
    const measure = () => page.evaluate(() => {
      const selectors = ['.topbar','.sidebar','.page-title','.page-title h1','.compliance-tabs','.compliance-tabs a','.at-heading','.at-heading h1','.at-heading .el-button','.at-tabs','.at-tabs > button:not(.active)','.at-tabs > button.active','.at-page','.at-page .el-button']
      return Object.fromEntries(selectors.map(selector => {
        const el = document.querySelector(selector), c = getComputedStyle(el)
        const keys = ['fontFamily','fontSize','fontWeight','lineHeight','padding','margin','borderRadius','borderWidth','height','gap','position']
        return [selector,Object.fromEntries(keys.map(k => [k,c[k]]))]
      }))
    })
    const execution = await measure()
    await page.evaluate(() => document.querySelector('.main-content').scrollTop=0)
    await page.screenshot({path:output+'/header-unified-execution.png',fullPage:true})
    await page.getByRole('button',{name:'统计指标',exact:true}).click()
    await page.locator('.ats-statistics').waitFor()
    const statistics = await measure()
    // Both views use the same shared header. Only the selected tab and content differ.
    assert.deepEqual(execution,statistics)
    await page.screenshot({path:output+'/header-reference-statistics.png',fullPage:true})
    await page.getByRole('button',{name:'轨迹接入与校验',exact:true}).click()
    await page.locator('.at-ingest').waitFor()
    const ingest = await measure()
    for (const selector of ['.topbar','.sidebar','.page-title','.page-title h1','.compliance-tabs','.compliance-tabs a']) assert.deepEqual(execution[selector],ingest[selector])
    assert.equal(await page.locator('.at-execution').count(),0)
    assert.deepEqual(errors,[])
    fs.writeFileSync(output+'/header-unified-check.json',JSON.stringify({execution,statistics,ingest,passed:true},null,2))
    console.log('PASS: default batch auto-loads; later draft changes stay local until Query; no demo badge; shared headers match; Mock-only verification.')
  } finally { await browser.close() }
})().catch(error => {console.error(error);process.exitCode=1})

