// Isolated UI test: every API response is stubbed; no real task or model call is made.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const base = process.env.AGENT_BATCH_TEST_URL || 'http://127.0.0.1:1238'
const out =
  process.env.AGENT_BATCH_OUTPUT_DIR || path.resolve('docs/internal-agent-batch-verification')
const modes = [
  {
    code: 'privacy',
    label: '隐私风险核查',
    tools: ['query_dataset_info'],
    allowed_scopes: ['dataset:read'],
    description: '检查所选测试样本。',
  },
  {
    code: 'policy_test',
    label: '越权拦截演示',
    tools: ['export_report'],
    allowed_scopes: ['dataset:read'],
    description: '测试权限拦截。',
  },
]
const options = {
  datasets: [{ id: 15, name: '测试数据集', version: 'v1', record_count: 30 }],
  models: [{ id: 'deepseek', name: 'DeepSeek', upstream_model_id: 'deepseek-chat' }],
  model_error: '',
  tools: ['query_dataset_info'],
  modes,
  can_create: true,
  limits: {
    sample_limit: 10,
    dataset_records: 100,
    sample_characters: 1500,
    max_rounds: 8,
    max_calls: 12,
    timeout_seconds: 300,
  },
}
;(async () => {
  fs.mkdirSync(out, { recursive: true })
  let browser, server, page
  const errors = []
  try {
    if (process.env.AGENT_BATCH_START_SERVER === '1') {
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
      assert.ok(ready, 'Isolated Vite did not start')
    }
    browser = await chromium.launch({ headless: true, channel: 'msedge' })
    page = await browser.newPage({ viewport: { width: 1700, height: 1200 } })
    const submissions = [],
      keys = []
    let groups = Array.from({ length: 24 }, (_, i) => ({
      batch_id: `batch-${i + 1}`,
      display_id: `AGT-${i + 1}`,
      name: `已有批次${String(i + 1).padStart(2, '0')}`,
      trace_count: 1,
    }))
    let runs = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.addInitScript(() => sessionStorage.setItem('accessToken', 'isolated-ui-test'))
    await page.route('**/api/v1/**', async (route) => {
      const request = route.request(),
        url = new URL(request.url())
      let data
      if (url.pathname === '/api/v1/model-workbenches/current')
        data = {
          models: [],
          training: [],
          services: [],
          calls: [],
          assessment: null,
          datasets: [],
          changes: [],
        }
      else if (url.pathname === '/api/v1/internal-agent/options') data = options
      else if (url.pathname === '/api/v1/internal-agent/batches') {
        const q = url.searchParams.get('q') || '',
          p = Number(url.searchParams.get('page') || 1)
        const list = groups.filter((b) => `${b.name} ${b.display_id}`.includes(q))
        data = {
          items: list.slice((p - 1) * 20, p * 20),
          page: p,
          page_size: 20,
          total: list.length,
          total_pages: Math.ceil(list.length / 20),
        }
      } else if (url.pathname === '/api/v1/internal-agent/runs' && request.method() === 'POST') {
        const body = request.postDataJSON()
        submissions.push(body)
        keys.push(request.headers()['x-request-id'])
        let batch
        if (body.batch_mode === 'new') {
          batch = {
            batch_id: 'new-group',
            display_id: 'AGT-NEW',
            name: body.batch_name,
            trace_count: 0,
          }
          groups.unshift(batch)
        } else batch = groups.find((b) => b.batch_id === body.batch_id)
        assert.ok(batch, 'The submitted batch must exist')
        batch.trace_count++
        const id = 'AT-TEST-' + submissions.length
        data = {
          ...body,
          run_id: id,
          status: 'succeeded',
          stop_requested: false,
          rounds: 1,
          call_count: 0,
          blocked_count: 0,
          dataset: options.datasets[0],
          policy: {
            mode: body.mode,
            description: '',
            allowed_tools: [],
            allowed_scopes: [],
            denied_scopes: [],
            version: 'test',
          },
          batch: { batch_id: batch.batch_id, display_id: batch.display_id, name: batch.name },
          trace: {
            batch_id: batch.batch_id,
            snapshot_id: `snapshot-${submissions.length}`,
            trace_id: `trace-${submissions.length}`,
          },
          answer: '隔离测试结果',
          error: '',
          trace_error: '',
          token_usage: { total_tokens: 120, input_tokens: 100, output_tokens: 20, complete: true },
          created_at: '2026-11-12T16:00:00',
          finished_at: '2026-11-12T16:00:01',
          calls: [],
          messages: [],
          invocations: [],
        }
        runs.unshift(data)
      } else if (url.pathname === '/api/v1/internal-agent/runs') data = { items: runs, limit: 50 }
      else if (url.pathname.startsWith('/api/v1/internal-agent/runs/'))
        data = runs.find((r) => url.pathname.endsWith('/' + r.run_id))
      else {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 503, message: '隔离测试，未连接真实接口', data: null }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok', data }),
      })
    })
    await page.goto(base + '/model-train/agent-tasks')
    const form = page.locator('.agent-workspace').first()
    const submit = page.getByRole('button', { name: '发起智能体任务', exact: true })
    await submit.waitFor()
    await page.getByRole('textbox', { name: '新批次名称', exact: true }).waitFor()
    assert.ok(await submit.isDisabled(), 'A new batch requires a name')
    await page.getByText('加入已有批次', { exact: true }).click()
    assert.ok(await submit.isDisabled(), 'Joining requires an explicit selection')
    const select = page.locator('.agent-batch-select .el-select')
    await select.click()
    await page.getByRole('button', { name: '加载更多批次', exact: true }).click()
    await page.getByRole('option', { name: /已有批次24/ }).waitFor()
    await page.getByRole('option', { name: /已有批次01/ }).click()
    await page.getByText('新建批次', { exact: true }).click()
    await page.getByRole('textbox', { name: '新批次名称', exact: true }).fill('11月权限测试')
    await submit.click()
    await page.locator('.el-drawer').getByText('隔离测试结果', { exact: true }).waitFor()
    assert.equal(submissions[0].batch_mode, 'new')
    assert.equal(submissions[0].batch_name, '11月权限测试')
    assert.ok(!('batch_id' in submissions[0]), 'Hidden existing choice must not be submitted')
    await page.locator('.el-drawer:visible .el-drawer__close-btn').click()
    await page.getByText('加入已有批次', { exact: true }).click()
    await select.click()
    await select.locator('input').fill('11月权限测试')
    await page.getByRole('option', { name: /11月权限测试/ }).click()
    await submit.click()
    await page.locator('.el-drawer').getByText('AT-TEST-2', { exact: true }).waitFor()
    assert.equal(submissions[1].batch_mode, 'existing')
    assert.equal(submissions[1].batch_id, 'new-group')
    assert.ok(!('batch_name' in submissions[1]), 'Hidden new name must not be submitted')
    assert.notEqual(keys[0], keys[1])
    await page.locator('.el-drawer').getByText('11月权限测试', { exact: true }).waitFor()
    await page.locator('.el-drawer:visible .el-drawer__close-btn').click()
    await page.waitForFunction(() =>
      document.querySelector('.agent-batch-select')?.textContent.includes('2 条轨迹'),
    )
    await page.locator('.el-drawer:visible').waitFor({ state: 'hidden' })
    await page.screenshot({ path: path.join(out, 'joined-batch.png'), fullPage: true })
    await page.setViewportSize({ width: 1000, height: 1100 })
    await page.screenshot({ path: path.join(out, 'narrow.png'), fullPage: true })
    assert.ok(await form.isVisible())
    groups = []
    runs = []
    await page.goto(base + '/model-train/agent-tasks')
    await page.getByText('加入已有批次', { exact: true }).click()
    await page.locator('.agent-batch-select .el-select').click()
    await page.getByText('还没有可加入的批次，请先新建', { exact: true }).waitFor()
    assert.ok(await page.getByRole('button', { name: '发起智能体任务', exact: true }).isDisabled())
    assert.deepEqual(errors, [])
    console.log(
      'Passed: required batch choice, pagination/search, create new, join existing, hidden fields excluded, shared batch label/count, empty state and responsive view; no real task executed.',
    )
  } catch (error) {
    if (page) {
      await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true })
      console.error('Page:', page.url(), 'Runtime errors:', errors)
      console.error((await page.locator('body').innerText()).slice(0, 1300))
    }
    throw error
  } finally {
    await browser?.close()
    server?.kill()
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
