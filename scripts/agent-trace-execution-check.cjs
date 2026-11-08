const {chromium}=require('C:/Users/29504/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const {spawn}=require('node:child_process')
const fs=require('node:fs'),assert=require('node:assert/strict')
const server={kill(){}}
;(async()=>{let browser;try{
 for(let i=0;i<40;i++){try{await fetch('http://127.0.0.1:1223');break}catch{await new Promise(r=>setTimeout(r,250))}}
 browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage({viewport:{width:1950,height:1326}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/api/v1/**',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:503,message:'浏览器样式验收：仅使用演示模式',data:null})}));await page.addInitScript(()=>sessionStorage.setItem('accessToken','local-demo-verification')); await page.goto('http://127.0.0.1:1223/compliance/agent-traces?view=execution');await page.locator('.at-execution').waitFor(); await page.locator('.compliance-mode .el-switch').evaluate(el=>{if(el.getAttribute('aria-checked')!=='true'&&!el.classList.contains('is-checked'))el.click()}); await page.waitForTimeout(500);await page.locator('.ex-sample').first().waitFor();await page.locator('.path-scroll > svg > g').first().waitFor();assert.equal(await page.locator('.ex-sample').count(),6);assert.equal(await page.locator('.path-scroll > svg > g').count(),18);await page.locator('.path-scroll > svg > g').nth(6).click();await page.waitForTimeout(150);assert.match(await page.locator('.ex-log tr.selected').innerText(),/STEP-07/);fs.mkdirSync('docs/agent-trace-execution-verification',{recursive:true});await page.evaluate(()=>{document.querySelector('.main-content').scrollTop=0});await page.screenshot({path:'docs/agent-trace-execution-verification/page.png',fullPage:true});console.log(await page.evaluate(()=>Object.fromEntries(['.compliance-tabs','.at-heading','.at-tabs','.ex-query','.ex-columns','.ex-log','.at-tabs>button.active'].map(q=>{const e=document.querySelector(q),r=e.getBoundingClientRect(),c=getComputedStyle(e);return [q,{y:r.y,height:r.height,text:e.textContent,color:c.color,font:c.fontSize,margin:c.margin,padding:c.padding}]}))));await page.getByRole('button',{name:'统计指标',exact:true}).click();await page.waitForTimeout(300);assert.equal(await page.locator('.at-execution').count(),0);assert.equal(await page.locator('.topbar').evaluate(el=>getComputedStyle(el).height),'75px');assert.deepEqual(errors,[]);console.log('Browser checks passed: query, 6 samples, 18 graph nodes, node/log linkage, no runtime errors')
 }finally{await browser?.close();server.kill()}})().catch(e=>{console.error(e);process.exitCode=1})








