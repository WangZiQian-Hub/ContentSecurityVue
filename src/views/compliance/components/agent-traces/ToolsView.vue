<script setup lang="ts">
import ViewExportStatus from './ViewExportStatus.vue'
import { computed,onUnmounted,ref,watch } from 'vue'
import ToolGlyph from './ToolGlyph.vue'
import ToolSequence from './ToolSequence.vue'
import { useRouter } from 'vue-router'
import { useComplianceStore } from '../../../../stores/compliance'
import { toolsHttp } from '../../../../api/agent-trace-tools'
import { toolsMock } from '../../../../mock/agent-trace-tools'
import type { ToolsOptions,ToolsOverview,ToolSelection,ToolsParams } from '../../../../types/agent-trace-tools'
import { traceZip,tracePng } from '../../../../utils/agent-trace-export'
import { useExecutionExport } from '../../../../composables/useExecutionExport'
const packageDialog=ref(false),packageScope=ref('sample'),packageContents=ref(['normalized_json','evidence_index','manifest'])
const lastExportKind=ref<'view'|'package'>('view')
const initializing=ref(false)
const parent=useComplianceStore(),router=useRouter(),options=ref<ToolsOptions>(),result=ref<ToolsOverview>(),selected=ref<ToolSelection|null>(null),batch=ref(''),sample=ref(''),busy=ref(false),error=ref(''),drawer=ref(false),raw=ref(''),exporter=useExecutionExport()
let selectionVersion=0
let generation=0,controller:AbortController|undefined
const api=()=>parent.demo?toolsMock:toolsHttp
const dirty=computed(()=>!result.value||batch.value!==result.value.scope.batchId||sample.value!==result.value.traceId)
const canView=computed(()=>!!result.value&&!dirty.value&&!busy.value&&!exporter.busy.value&&!exporter.downloading.value&&result.value.permissions.canExport)
function scopeParams():ToolsParams{return {...result.value?.scope}}
async function loadOptions(){const v=++generation;controller?.abort();controller=new AbortController();try{const data=await api().workspace({batchId:batch.value},controller.signal);if(v===generation){options.value=data;return data}}catch(e){if(v===generation)error.value=String(e)}}
// Initial entry resolves one batch and one sample through the same HTTP/Mock API.
async function initialize(){
 initializing.value=true
 try{
  const first=await loadOptions()
  if(!first)return
  const defaultBatch=first.batchOptions.items[0]
  if(!defaultBatch)return
  batch.value=defaultBatch.batchId
  const scoped=await loadOptions()
  if(!scoped)return
  sample.value=scoped.sampleOptions.items[0]?.traceId||''
  if(sample.value)await query()
 }finally{initializing.value=false}
}
async function changeBatch(){
 sample.value=''
 const scoped=await loadOptions()
 if(scoped)sample.value=scoped.sampleOptions.items[0]?.traceId||''
 // Existing analysis remains until the user submits Query.
}
async function searchSamples(q:string){if(!options.value?.candidateScope)return;const v=++generation;try{const page=await api().samples(batch.value,{...options.value.candidateScope,q});if(v===generation&&options.value)options.value.sampleOptions=page}catch(e){error.value=String(e)}}
async function query(){if(!batch.value)return;if(!sample.value){if(options.value?.candidateScope?.batchId===batch.value&&options.value.sampleOptions.total===0){result.value=undefined;selected.value=null;exporter.reset()}return}if(options.value?.candidateScope?.batchId!==batch.value){error.value='批次选项尚未加载成功，请重新选择批次';return}const v=++generation;controller?.abort();controller=new AbortController();busy.value=true;error.value='';try{const data=await api().detail(batch.value,sample.value,{...options.value?.candidateScope,section:'overview'},controller.signal);if(v!==generation)return;result.value=data;selected.value=data.selection;exporter.reset()}catch(e){if(v===generation)error.value=String(e)}finally{if(v===generation)busy.value=false}}
async function selectCall(id:string){if(!result.value)return;const local=result.value.calls.items.find(c=>c.callId===id)||result.value.sequence.items.find(c=>c.callId===id);if(local){selectionVersion++;selected.value=local.selectionPreview||local;return}const selectionId=++selectionVersion;const v=generation;selected.value=null;try{const d=await api().detail(result.value.scope.batchId,result.value.traceId,{...scopeParams(),section:'selection',callId:id});if(v===generation&&selectionId===selectionVersion)selected.value=d.selection}catch(e){error.value=String(e)}}
async function pageCalls(page:number){if(!result.value)return;const v=generation;try{const d=await api().detail(result.value.scope.batchId,result.value.traceId,{...scopeParams(),section:'calls',callPage:page});if(v===generation&&result.value)result.value.calls=d.calls}catch(e){error.value=String(e)}}
async function more(){const d=result.value;if(!d?.sequence.nextCursor)return;const v=generation;try{const next=await api().detail(d.scope.batchId,d.traceId,{...scopeParams(),section:'sequence',sequenceCursor:d.sequence.nextCursor});if(v===generation)d.sequence={...next.sequence,items:[...d.sequence.items,...next.sequence.items]}}catch(e){error.value=String(e)}}
async function showRaw(){if(!result.value||!selected.value)return;drawer.value=true;raw.value='';const v=generation;try{const d=await api().detail(result.value.scope.batchId,result.value.traceId,{...scopeParams(),section:'selection',callId:selected.value.callId,includeRaw:true});if(v===generation)raw.value=d.selection?.rawEvents?.items.map(e=>e.rawText).join('\n\n')||'未提供原始事件'}catch(e){raw.value=String(e)}}
function locate(){if(!result.value||!selected.value)return;router.replace({query:{view:'execution',batchId:result.value.scope.batchId,snapshotId:result.value.scope.snapshotId,projectionVersion:result.value.scope.projectionVersion,traceId:result.value.traceId,eventId:selected.value.eventId}})}
const displayCall=(id:string)=>result.value?.calls.items.find(c=>c.callId===id)?.displayId||result.value?.sequence.items.find(c=>c.callId===id)?.displayId||id
const status=(s:string)=>({succeeded:'成功',failed:'错误',not_executed:'未执行',unknown:'未知'}[s]||s)
const seconds=(n:number|null)=>n==null?'—':`${(n/1000).toFixed(1)} s`
const color=(c:ToolSelection)=>c.permissionDecision==='denied'||c.executionStatus==='failed'?'#f23e53':c.behaviorTags.some(t=>t.code==='inefficient')?'#e9a000':'#146df5'
const cards=computed(()=>{const m=result.value?.metrics;return m?[['phone','调用',m.callCount,'次'],['layers','工具种类',m.toolKindCount,'种'],['check','成功',m.successCount,'次'],['shield','越权',m.overreachCount,'次'],['error','错误',m.errorCount,'次'],['clock','低效',m.inefficientCount,'次']]:[]})
async function exportFile(kind:'view'|'package'){const d=result.value;if(!d||!canView.value)return;lastExportKind.value=kind;await exporter.start({...d.scope,view:'tools',selectedTraceId:d.traceId,selectedCallId:selected.value?.callId,exportKind:kind,format:kind==='view'?'png':'zip',scope:{type:'sample',traceIds:[d.traceId],sourceId:null,issueType:null,q:null},contents:kind==='view'?['tools_png']:[...packageContents.value],redactionProfile:'standard',anonymizeIds:true},parent.demo,async()=>kind==='view'?tracePng(['智能体轨迹审计 · 工具交互',d.summary.traceDisplayId,...d.calls.items.map(c=>`${c.displayId} ${c.toolName} ${status(c.executionStatus)} ${c.durationMs??'—'}ms`)]):traceZip([{name:'manifest.json',text:JSON.stringify({scope:d.scope,traceId:d.traceId,contents:packageContents.value},null,2)},...(packageContents.value.includes('normalized_json')?[{name:'normalized.json',text:JSON.stringify(d,null,2)}]:[]),...(packageContents.value.includes('evidence_index')?[{name:'evidence-index.json',text:JSON.stringify(d.calls.items.map(c=>({callId:c.callId,eventId:c.eventId,evidenceChain:c.evidenceChain})),null,2)}]:[])]));if(parent.demo&&exporter.task.value?.result?.artifacts){exporter.task.value={...exporter.task.value,result:{...exporter.task.value.result,artifacts:exporter.task.value.result.artifacts.map(artifact=>({...artifact,filename:kind==='view'?'agent-trace-view.png':'agent-trace-results.zip'}))}}}}
function exportView(){return exportFile('view')}function openPackage(){if(!canView.value)return;packageScope.value='sample';packageContents.value=['normalized_json','evidence_index','manifest'];packageDialog.value=true}
async function confirmPackage(){await exportFile('package');if(!exporter.error.value)packageDialog.value=false}
defineExpose({canView,exportView,openPackage})
watch(()=>[batch.value,sample.value],()=>{generation++;controller?.abort();busy.value=false;raw.value='';drawer.value=false;packageDialog.value=false},{flush:'sync'})
watch(()=>parent.demo,()=>{generation++;controller?.abort();result.value=undefined;selected.value=null;batch.value='';sample.value='';error.value='';options.value=undefined;packageDialog.value=false;exporter.reset();initialize()},{immediate:true})
onUnmounted(()=>{generation++;controller?.abort();exporter.reset()})
</script>
<template>
<section class="tools-view">
<ViewExportStatus v-if="lastExportKind === 'view' && exporter.task.value" :task="exporter.task.value" :error="exporter.error.value" :download="exporter.download" />
<div v-if="lastExportKind !== 'view' && (exporter.task.value || exporter.error.value)" class="tools-export-status" role="status" aria-live="polite">
  <span>导出任务 · {{ exporter.task.value?.status || 'failed' }} · {{ exporter.batchId.value }}</span>
  <el-progress v-if="exporter.busy.value" :percentage="exporter.progress.value ?? 0" :indeterminate="exporter.progress.value == null" :status="exporter.task.value?.status === 'succeeded' ? 'success' : undefined" />
  <span v-if="exporter.downloading.value">正在下载…</span>
  <el-button v-if="!exporter.busy.value && exporter.task.value && ['pending','running'].includes(exporter.task.value.status)" @click="exporter.resume">恢复进度查询</el-button>
  <el-button class="tools-download-button" v-for="artifact in exporter.artifacts.value" :key="artifact.artifactId" :loading="exporter.downloading.value" @click="exporter.download(artifact)">下载 {{ artifact.filename }}</el-button>
  <span v-if="exporter.error.value" class="tools-export-error">{{ exporter.error.value }}</span>
  <el-button v-if="exporter.error.value && exporter.task.value?.status === 'failed'" :disabled="!canView" @click="exportFile(lastExportKind)">重新导出</el-button>
</div>
<div class="tools-query"><b>批次</b><el-select v-model="batch" placeholder="请选择批次" @change="changeBatch"><el-option v-for="b in options?.batchOptions.items" :key="b.batchId" :value="b.batchId" :label="b.displayId" /></el-select><b>当前样本</b><el-select v-model="sample" filterable remote :remote-method="searchSamples" placeholder="请选择当前样本" :disabled="!batch"><el-option v-for="s in options?.sampleOptions.items" :key="s.traceId" :value="s.traceId" :label="`${s.displayId} (${s.language.toUpperCase()})`" /></el-select><el-button type="primary" :loading="busy" :disabled="!batch||(!sample&&options?.sampleOptions.total!==0)" @click="query">查询</el-button></div>
<el-alert v-if="error||exporter.error.value" :title="error||exporter.error.value" type="error" :closable="false"/><el-alert v-if="result&&dirty" title="条件已更改，请查询；当前仍为上次查询结果" type="warning" :closable="false"/>
<template v-if="result"><div class="tools-result">当前结果：{{result.summary.batchDisplayId}} / {{result.summary.traceDisplayId}} ({{result.summary.language.toUpperCase()}}) · 测试类别：{{result.summary.testCategory?.label||'未提供'}} · 风险等级：{{({high:'高风险',medium:'中风险',low:'低风险',none:'无风险'} as Record<string,string>)[result.summary.riskLevel]||'未知'}} · 步骤：{{result.summary.eventCount??'—'}} · 来源：{{result.summary.source?.formatLabel||'未提供'}}</div>
<div class="tools-metrics"><h3>工具交互统计 <small>（行为标签可重叠）</small></h3><div v-for="(c,i) in cards" :key="i" class="tool-metric" :class="`metric-${i}`" :title="`未执行 ${result.metrics.notExecutedCount} 次；行为标签不参与状态求和`"><ToolGlyph :name="String(c[0])"/><b>{{c[1]}}</b><div class="metric-value"><strong>{{c[2]}}</strong><span>{{c[3]}}</span></div></div><div class="tool-timing"><h3>耗时统计（本样本）</h3><b>工具执行：{{seconds(result.timing.toolDurationSumMs)}}　 |　 其他处理：{{seconds(result.timing.otherDurationMs)}}　 |　 总耗时：{{seconds(result.timing.totalDurationMs)}}</b><p v-if="result.timing.hasOverlap">工具占用：{{seconds(result.timing.toolWallTimeMs)}}（并行累计时长不可相加）</p></div></div>
<div class="tools-columns"><div><article class="tool-panel"><h3>工具交互时序图 <small>（共 {{result.metrics.callCount}} 次调用，按时间顺序）</small></h3><div class="tool-sequence"><el-empty v-if="!result.metrics.callCount" description="该样本没有工具调用记录，可选择其他样本查看"/><ToolSequence v-else :items="result.sequence.items" :participants="result.sequence.participants" :total-duration-ms="result.timing.totalDurationMs" @select="selectCall"/></div><el-button v-if="!result.sequence.complete" @click="more">加载更多调用</el-button></article>
<article class="tool-panel"><h3>工具调用列表 <small>（共 {{result.calls.total}} 条）</small></h3><div class="tool-table-scroll"><table class="tool-calls"><colgroup><col v-for="(w,index) in [8,8,8,8,7,10,19,18,14]" :key="index" :style="{width:w+'%'}"/></colgroup><thead><tr><th v-for="h in ['ID','工具名称','关联步骤','耗时（ms）','状态','行为标签','请求参数（摘要）','响应结果（摘要）','证据链']" :key="h">{{h}}</th></tr></thead><tbody><tr v-for="c in result.calls.items" :key="c.callId" :class="{chosen:selected?.callId===c.callId}" @click="selectCall(c.callId)"><td><button @click.stop="selectCall(c.callId)">{{c.displayId}}</button></td><td>{{c.toolName.split('.').at(-1)}}</td><td>{{c.stepDisplayId}}</td><td>{{c.durationMs??'—'}}</td><td><span :class="c.executionStatus">{{status(c.executionStatus)}}</span></td><td><span v-for="t in c.behaviorTags" :key="t.code" :class="t.code">{{t.label}}</span><span v-if="!c.behaviorTags.length">正常调用</span></td><td :title="c.inputSummary">{{c.inputSummary}}</td><td>{{c.outputSummary}}</td><td>{{c.evidenceChain.map(e=>e.displayId).join(' → ')}}</td></tr></tbody></table></div><el-pagination v-if="result.calls.total>20" layout="prev,pager,next" :page-size="20" :total="result.calls.total" :current-page="result.calls.page" @current-change="pageCalls"/><el-empty v-if="!result.calls.total" description="暂无工具调用"/></article></div>
<div><article class="tool-panel"><div class="tool-detail-heading"><h3>选中调用详情：<em>{{selected?.displayId||'—'}}</em></h3><el-button size="small" type="primary" :disabled="!selected" @click="locate"><ToolGlyph name="locate"/>定位思维步骤</el-button><el-button size="small" :disabled="!selected||!result.permissions.canViewRaw" @click="showRaw"><ToolGlyph name="document"/>原始事件</el-button></div><template v-if="selected"><table class="tool-details"><colgroup><col style="width:31%"/><col style="width:69%"/></colgroup><tbody><tr v-for="(value,label) in {'工具名称':selected.toolName,'关联步骤':selected.stepDisplayId,'工具授权范围':selected.grantedScopes.join(', '),'请求权限':selected.requestedScopes.join(', '),'权限校验结果':selected.permissionDecision==='denied'?'权限未通过':selected.permissionDecision==='allowed'?'允许':'未知','执行状态':status(selected.executionStatus),'返回结果':selected.resultCode,'证据链':selected.evidenceChain.map(e=>e.displayId).join(' → ')}" :key="label"><th>{{label}}</th><td><span :class="label==='权限校验结果'&&selected.permissionDecision==='denied'?'overreach':label==='执行状态'?selected.executionStatus:''">{{value}}</span></td></tr><tr><th>请求参数（脱敏）</th><td><pre>{{selected.inputJson}}</pre></td></tr></tbody></table></template><el-empty v-else :description="result.metrics.callCount ? '请选择工具调用' : '该样本没有工具调用，无调用详情'"/></article>
<article class="tool-panel"><h3>权限与异常分析</h3><template v-if="selected"><h4>1. 权限对比（请求 vs 授权）</h4><table class="tool-permissions"><colgroup><col style="width:24%"/><col style="width:27%"/><col style="width:33%"/><col style="width:16%"/></colgroup><thead><tr><th>维度</th><th>授权范围（该工具）</th><th>本次请求</th><th>对比结果</th></tr></thead><tbody><tr v-for="row in selected.analysis.permissionComparison.rows" :key="row.label"><td>{{row.label}}</td><td>{{row.granted.join(', ')}}</td><td>{{row.requested.join(', ')}}</td><td :class="row.comparison==='mismatch'?'denied':''">{{row.comparison==='match'?'匹配':row.comparison==='mismatch'?'不匹配':'未知'}}</td></tr><tr><th>实际判定</th><td colspan="3" :class="selected.permissionDecision==='denied'?'denied':''">{{selected.analysis.permissionComparison.actualDecision.message}}</td></tr></tbody></table><h4>2. 错误归因</h4><p class="tool-explanation"><ToolGlyph v-if="selected.analysis.errorAttribution" name="error" class="error-icon"/>{{selected.analysis.errorAttribution?.message||'无已知异常'}}</p></template><h4>3. 低效调用证据</h4><p v-for="g in result.sampleAnalysis.inefficiencyGroups" :key="g.canonicalCallId" class="tool-explanation"><ToolGlyph name="clock" class="warning-icon"/><button @click="selectCall(g.canonicalCallId)">{{displayCall(g.canonicalCallId)}}</button> → <button v-for="id in g.duplicateCallIds" :key="id" @click="selectCall(id)">{{displayCall(id)}}</button>：{{g.reason}}</p><p v-if="!result.sampleAnalysis.inefficiencyGroups.length">暂无低效调用证据</p></article></div></div></template><el-skeleton v-else-if="initializing" :rows="12" animated/><el-empty v-else :description="error ? '加载失败，请重新查询或刷新重试' : '当前批次没有可查询的样本，请选择其他批次'"/>
<el-dialog v-model="packageDialog" title="导出结果包" width="640px" align-center append-to-body class="trace-package-dialog tools-package-dialog" :close-on-click-modal="!exporter.busy.value" :close-on-press-escape="!exporter.busy.value" :show-close="!exporter.busy.value">
  <template v-if="result">
    <h3 class="trace-package-section">工具交互 · 导出范围</h3><p>批次 {{result.summary.batchDisplayId}} · 当前快照 {{result.scope.snapshotId}}</p>
    <el-select v-model="packageScope" aria-label="导出范围" :disabled="exporter.busy.value"><el-option value="sample" :label="`当前样本（${result.summary.traceDisplayId}）`"/></el-select>
    <el-checkbox-group v-model="packageContents" class="tools-package-contents" :disabled="exporter.busy.value">
      <el-checkbox value="normalized_json">标准化 JSON</el-checkbox>
      <el-checkbox value="evidence_index">证据索引</el-checkbox>
      <el-checkbox value="manifest" disabled>manifest 清单</el-checkbox>
    </el-checkbox-group>
    <p>✓ 敏感字段脱敏 ✓ 样本编号匿名化（默认启用）</p>
    <small>按当前已查询样本、固定快照及授权脱敏策略生成 ZIP。生成完成后在导出任务栏点击下载。</small>
    <el-alert v-if="exporter.error.value" :title="exporter.error.value" type="error" :closable="false"/>
  </template>
  <template #footer><el-button :disabled="exporter.busy.value" @click="packageDialog=false">取消</el-button><el-button type="primary" :loading="exporter.busy.value" :disabled="!canView" @click="confirmPackage">生成 ZIP</el-button></template>
</el-dialog>
<el-drawer v-model="drawer" title="原始事件（脱敏）" size="55%"><pre>{{raw||'加载中…'}}</pre></el-drawer>
</section>
</template>
<style scoped>
.tools-package-contents{display:flex;flex-wrap:wrap;gap:0 12px;margin:16px 0}
.tools-package-dialog p{margin:12px 0;line-height:1.7}.tools-package-dialog small{display:block;line-height:1.7;color:#7a8ca8}

.tools-export-status .el-button.tools-download-button{height:32px;width:auto;min-width:0;padding:8px 15px;margin:0;border:var(--el-border);border-radius:var(--el-border-radius-base);background:var(--el-fill-color-blank);color:var(--el-text-color-regular);font-family:"Microsoft YaHei","PingFang SC",Arial,sans-serif;font-size:var(--el-font-size-base);font-weight:500;line-height:1;box-shadow:none}
.tools-export-status .el-button.tools-download-button:hover{background:var(--el-color-primary-light-9);border-color:var(--el-color-primary-light-7);color:var(--el-color-primary)}
.tools-export-status .el-button.tools-download-button:focus-visible{outline:2px solid #6293ef;outline-offset:2px}

.tools-export-status{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px;margin:12px 0 10px;background:#edf6ff;color:#526d98;font-size:14px;border:0;border-radius:8px}.tools-export-status .el-progress{width:280px;max-width:100%}.tools-export-error{color:#e93248}

.tools-view{font-family:"Microsoft YaHei",Arial,sans-serif;color:#17365e;font-size:13px}.tools-query{display:flex;align-items:center;gap:18px;padding:12px 8px}.tools-query .el-select{width:190px}.tools-result{background:#e1edff;border-radius:5px;padding:11px;margin:0 0 12px}.tools-metrics{display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid #d4e4fa;border-radius:8px;margin-bottom:12px;background:#ffffffb5}.tools-metrics h3{white-space:nowrap}.tool-metric{border:1px solid #dfebfb;border-radius:8px;min-width:85px;padding:8px;text-align:center;color:#146df5}.tool-metric span{float:left;font-size:23px}.tool-metric b{display:block;font-size:13px}.tool-metric strong{display:inline-block;font-size:27px;margin:4px 4px 0 15px}.metric-2{color:#19b24c}.metric-3,.metric-4{color:#f23e53}.metric-5{color:#e9a000}.tool-timing{border-left:1px solid #d4e4fa;padding-left:15px;flex:1;font-size:12px}.tool-timing h3{margin-bottom:8px}.tools-columns{display:grid;grid-template-columns:1.65fr 1fr;gap:12px}.tool-panel{border:1px solid #d2e3fb;border-radius:8px;padding:12px;background:linear-gradient(135deg,#fff9,#f7faffc9);margin-bottom:12px;min-width:0}h3{font-size:16px;margin:0 0 10px;color:#122c53}small{font-size:12px;font-weight:500}h4{font-size:13px;margin:12px 0 6px}.tool-sequence{max-height:430px;overflow:auto}.tool-sequence svg{width:100%;min-width:660px;font-size:13px}.tool-sequence g[role=button]{cursor:pointer}.tool-table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #dce8f8;padding:5px 7px;text-align:left}thead,th{background:#e8f1ff}td{max-width:220px;overflow:hidden;text-overflow:ellipsis}tr.chosen{background:#ffe7e9}.tool-details th{width:32%;white-space:nowrap}.tool-detail-heading{display:flex;align-items:center;gap:7px;margin-bottom:8px}.tool-detail-heading h3{flex:1;font-size:15px;margin:0}.tool-detail-heading em{font-style:normal;background:#ffe8ea;color:#e8394d}.tool-detail-heading .el-button{margin:0;padding:6px}pre{white-space:pre-wrap;word-break:break-word;background:#eaf3ff;padding:10px;margin:3px;border-radius:6px}.tool-explanation{font-size:12px;line-height:1.7;margin:5px 0;padding:6px;border-bottom:1px solid #e4edfa}button:not(.el-button){border:0;background:transparent;color:#146df5;cursor:pointer;font-weight:600}.succeeded{color:#159a43;background:#dff7e6}.failed,.not_executed,.overreach,.denied{color:#e93248;background:#ffe7e9}.inefficient{color:#c68a00;background:#fff0c1}@media(max-width:1300px){.tools-metrics{flex-wrap:wrap}.tools-columns{grid-template-columns:1.4fr 1fr}.tool-detail-heading{flex-wrap:wrap}}@media(max-width:1000px){.tools-columns{grid-template-columns:1fr}.tools-query{flex-wrap:wrap}}
</style>

<style>
/* Every selector is gated by the tools view; sibling pages retain their styles. */
.tools-view .tools-query{padding:10px 12px;gap:18px;height:54px;box-sizing:border-box}
.tools-view .tools-query>b{color:#152e54;font-size:14px}
.tools-view .tools-query>.el-select{width:205px}
.tools-view .tools-query .el-select__selected-item{font-weight:600;color:#223b60}
.tools-view .tools-query>.el-button{height:34px;min-width:80px;background:#146df5;color:white;border:1px solid #146df5;border-radius:5px;font-weight:600;font-size:14px}
.tools-view .tools-result{padding:9px 12px;font-size:14px;line-height:20px;margin-bottom:12px;color:#243f6b;font-weight:500}
.tools-view .tools-metrics{height:84px;flex-wrap:nowrap;gap:10px;padding:8px 14px;margin-bottom:12px}
.tools-view .tools-metrics>h3{font-size:18px;display:flex;align-items:center;gap:5px;margin:0;min-width:255px;color:#172d50}
.tools-view .tools-metrics>h3 small{font-size:12px;white-space:nowrap}
.tools-view .tool-metric{height:66px;min-width:0;flex:0 0 120px;padding:7px 10px;box-sizing:border-box;border:1px solid #dbe7fa;background:#f8fbff;display:grid;grid-template-columns:26px 1fr;grid-template-rows:22px 29px;column-gap:7px;text-align:center}
.tools-view .tool-metric>.tool-glyph{grid-column:1;grid-row:1;width:23px;height:23px}
.tools-view .tool-metric>b{grid-column:2;grid-row:1;font-size:14px;color:#172d50;white-space:nowrap}
.tools-view .tool-metric .metric-value{grid-column:2;grid-row:2;display:flex;align-items:baseline;justify-content:center;gap:7px}
.tools-view .tool-metric strong{display:inline;margin:0;font-size:30px;line-height:31px}
.tools-view .tool-metric .metric-value>span{float:none;color:#233858;font-size:12px}
.tools-view .tool-timing{margin-left:8px;padding-left:18px;white-space:nowrap;color:#223858;font-size:12px}
.tools-view .tool-timing h3{font-size:18px;color:#162e52}
.tools-view .tools-columns{grid-template-columns:minmax(0,1.78fr) minmax(0,1fr);gap:14px}
.tools-view .tools-columns>div{min-width:0}
.tools-view .tool-panel{padding:12px 14px;background:linear-gradient(120deg,#ffffffd9,#f7faffc9);border-color:#d3e3fc}
.tools-view h3{font-family:"Microsoft YaHei",Arial,sans-serif;color:#122b50;font-size:18px;font-weight:700}
.tools-view .tool-panel h3 small{font-size:13px}
.tools-view .tool-sequence{height:400px;max-height:450px;overflow:auto}
.tools-view table{table-layout:fixed;width:100%;font-family:"Microsoft YaHei",Arial,sans-serif;font-size:12px;border-collapse:collapse}
.tools-view table th,.tools-view table td{box-sizing:border-box;height:29px;padding:4px 8px;border:1px solid #dae6f8;font-size:12px;line-height:19px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:transparent;color:#23354f}
.tools-view table th{font-weight:700;background:#e6effc;text-align:left}
.tools-view table thead th{font-size:12px}
.tools-view table th:nth-child(n){width:auto}
.tools-view .tool-calls{min-width:1010px}
.tools-view table.tool-details th:nth-child(n){width:31%;white-space:nowrap}
.tools-view .tool-calls tbody tr:nth-child(even){background:#f6faff}
.tools-view .tool-calls tbody tr.chosen{background:#ffe7ea}
.tools-view .tool-calls td:first-child button{font-weight:700;font-size:12px;padding:0;white-space:nowrap}
.tools-view .tool-calls td:nth-child(4),.tools-view .tool-calls td:nth-child(5),.tools-view .tool-calls th:nth-child(4),.tools-view .tool-calls th:nth-child(5){text-align:center}
.tools-view .tool-calls td>span,.tools-view .tool-details td>span.overreach,.tools-view .tool-details td>span.not_executed,.tools-view .tool-details td>span.failed{padding:2px 8px;border-radius:4px;font-weight:700}
.tools-view .tool-calls td:nth-child(6)>span:not([class]){background:#e4efff;color:#3d5e8e}
.tools-view .tool-details th{width:31%;color:#243b5c;background:#e5effc;white-space:normal;overflow:visible;text-overflow:clip}
.tools-view .tool-details td{width:auto;white-space:normal;overflow:visible;word-break:break-word}
.tools-view .tool-details tr:not(:last-child) th,.tools-view .tool-details tr:not(:last-child) td{height:26px;padding:2px 9px}
.tools-view .tool-details pre{font-size:13px;font-family:Consolas,monospace;line-height:20px;padding:10px 14px;background:#eaf3ff;border:1px solid #d7e6fb;min-height:80px;margin:4px;border-radius:7px}
.tools-view .tool-detail-heading{display:flex;flex-wrap:nowrap;gap:9px;margin-bottom:9px}
.tools-view .tool-detail-heading h3{font-size:17px;white-space:nowrap}
.tools-view .tool-detail-heading em{font-size:16px;border-radius:4px;padding:1px 5px}
.tools-view .tool-detail-heading .el-button{height:29px;padding:0 10px;font-size:12px;font-weight:600;border:1px solid #c7ddfc;background:#fff;color:#146df5}
.tools-view .tool-detail-heading .el-button--primary{background:#146df5;border-color:#146df5;color:white}
.tools-view .tool-detail-heading .tool-glyph{width:17px;height:17px;margin-right:5px}
.tools-view .tool-permissions th,.tools-view .tool-permissions td{white-space:normal;overflow:visible;font-size:12px;padding:5px 8px}
.tools-view .tool-permissions td.denied{background:#ffe6e9;color:#e92f42;font-weight:700}
.tools-view .tool-permissions tr:last-child th{background:#ffe6e9}
.tools-view h4{font-size:14px;color:#172f53;margin:10px 0 7px}
.tools-view .tool-explanation{display:block;line-height:20px;font-size:12px;padding:3px 0 8px;color:#263950}
.tools-view .tool-explanation .tool-glyph{width:19px;height:19px;margin-right:8px;float:left}
.tools-view .error-icon{color:#f5384e}.tools-view .warning-icon{color:#e8a000}
@media(max-width:1500px){.tools-view .tools-metrics{height:auto;flex-wrap:wrap}.tools-view .tool-timing{flex:1}.tools-view .tool-metric{flex-basis:116px}}
@media(max-width:1100px){.tools-view .tools-columns{grid-template-columns:1fr}.tools-view .tool-sequence{height:auto}.tools-view .tools-query{height:auto;flex-wrap:wrap}}
</style>
