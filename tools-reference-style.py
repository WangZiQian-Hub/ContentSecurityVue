from pathlib import Path
r=Path('.')
def put(p,s):Path(p).write_text(s,encoding='utf-8')
put('src/views/compliance/components/agent-traces/ToolGlyph.vue','''<script setup lang="ts">
defineProps<{name:string}>()
</script>
<template><svg class="tool-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<g v-if="name==='phone'"><path d="M7 3 4 5c-3 6 9 18 15 15l2-3-5-4-3 3a15 15 0 0 1-5-5l3-3Z"/></g>
<g v-else-if="name==='layers'"><path d="m12 2 10 5-10 5L2 7Zm-10 10 10 5 10-5M2 17l10 5 10-5"/></g>
<g v-else-if="name==='shield'"><path d="m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5Z"/><path d="M12 7v7m0 3h.01"/></g>
<g v-else-if="name==='check'"><circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/></g>
<g v-else-if="name==='error'"><circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><path d="m8 8 8 8m0-8-8 8" stroke="white"/></g>
<g v-else-if="name==='clock'"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l5 2"/></g>
<g v-else-if="name==='agent'"><rect x="4" y="6" width="16" height="13" rx="3"/><path d="M12 2v4M1 10v5m22-5v5M8 22v-3m8 3v-3M8 11h.01m8 0h.01M8 15h8"/></g>
<g v-else-if="name==='web'"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 9h20M6 6h.01m3 0h.01"/></g>
<g v-else-if="name==='data'"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/></g>
<g v-else-if="name==='locate'"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/></g>
<g v-else-if="name==='document'"><path d="M5 2h9l5 5v15H5Zm9 0v6h5M8 12h8M8 16h8"/></g>
<g v-else><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></g>
</svg></template>
<style scoped>.tool-glyph{width:22px;height:22px;flex:none;vertical-align:middle;display:inline-block}</style>
''')
put('src/views/compliance/components/agent-traces/ToolSequence.vue','''<script setup lang="ts">
import { computed } from 'vue'
import type {ToolCall} from '../../../../types/agent-trace-tools'
import ToolGlyph from './ToolGlyph.vue'
const props=defineProps<{items:ToolCall[];participants:{participantId:string;label:string}[];totalDurationMs:number|null}>()
defineEmits<{select:[id:string]}>()
const height=computed(()=>props.items.length*51+78)
const x=(i:number)=>160+i*(770/Math.max(props.participants.length-1,1))
const target=(c:ToolCall)=>x(Math.max(1,props.participants.findIndex(p=>p.participantId===c.toParticipantId)))
const tone=(c:ToolCall)=>c.permissionDecision==='denied'||c.executionStatus==='failed'?'#ff253d':c.behaviorTags.some(t=>t.code==='inefficient')?'#f4a300':'#246bff'
const returned=(c:ToolCall)=>c.permissionDecision==='denied'?'权限未通过（No actual data export）':c.executionStatus==='failed'?'接口错误':c.behaviorTags.some(t=>t.code==='inefficient')?'重复低效':c.executionStatus==='succeeded'?'成功':'未知'
const action=(c:ToolCall)=>c.toolName.split('.').at(-1)
const glyph=(id:string)=>({agent:'agent',search:'search',web:'web',data:'data',policy:'shield'}[id]||'web')
</script>
<template><svg class="tool-sequence-svg" :viewBox="`0 0 1000 ${height}`" role="img" aria-label="工具交互时序图">
<defs><marker v-for="(fill,i) in ['#246bff','#ff253d','#f4a300','#637184']" :id="`tools-head-${i}`" :key="fill" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" :fill="fill"/></marker></defs>
<text x="20" y="67" fill="#243653" font-weight="700">时间 ↓</text><line x1="72" x2="72" y1="88" :y2="height-15" stroke="#8793a5" stroke-width="2"/>
<g v-for="(p,i) in participants" :key="p.participantId"><rect :x="x(i)-53" y="3" width="112" height="30" rx="5" fill="#e0ecff"/><foreignObject :x="x(i)-38" y="7" width="23" height="23"><ToolGlyph :name="glyph(p.participantId)" style="color:#246bff;width:21px;height:21px"/></foreignObject><text :x="x(i)+18" y="24" text-anchor="middle" fill="#162e54" font-weight="700">{{p.label}}</text><line :x1="x(i)" :x2="x(i)" y1="35" :y2="height-8" stroke="#8b96a5" stroke-dasharray="3 3"/></g>
<g v-for="(c,i) in items" :key="c.callId" role="button" tabindex="0" :aria-label="c.displayId" @click="$emit('select',c.callId)" @keydown.enter="$emit('select',c.callId)" @keydown.space.prevent="$emit('select',c.callId)">
<circle cx="72" :cy="76+i*51" r="4" stroke="#778398" fill="white" stroke-width="1.8"/><text x="7" :y="81+i*51" fill="#293e5d">{{c.relativeStartMs==null?'未知':(c.relativeStartMs/1000).toFixed(2)+' s'}}</text>
<text :x="(160+target(c))/2" :y="78+i*51" :fill="tone(c)" text-anchor="middle" font-weight="700">{{c.displayId}}: {{action(c)}} {{c.durationMs==null?'（已拦截）':`（${c.durationMs} ms）`}}</text>
<line x1="160" :x2="target(c)" :y1="86+i*51" :y2="86+i*51" :stroke="tone(c)" stroke-width="2" :marker-end="`url(#tools-head-${tone(c)==='#ff253d'?1:tone(c)==='#f4a300'?2:0})`"/>
<g v-if="c.permissionDecision==='denied'"><circle :cx="target(c)" :cy="86+i*51" r="10" fill="white" stroke="#ff253d" stroke-width="2"/><path :d="`M${target(c)-4} ${82+i*51}l8 8m0-8-8 8`" stroke="#ff253d" stroke-width="2"/></g>
<line :x1="target(c)" x2="160" :y1="105+i*51" :y2="105+i*51" stroke="#637184" stroke-dasharray="4 3" marker-end="url(#tools-head-3)"/>
<foreignObject x="165" :y="92+i*51" :width="Math.max(170,target(c)-170)" height="26"><div xmlns="http://www.w3.org/1999/xhtml" class="return-caption">返回：<span :class="c.permissionDecision==='denied'||c.executionStatus==='failed'?'danger':c.behaviorTags.length?'warning':'success'">{{returned(c)}}</span></div></foreignObject>
</g><circle cx="72" :cy="height-16" r="4" stroke="#778398" fill="white" stroke-width="1.8"/><text x="7" :y="height-11" fill="#293e5d">{{totalDurationMs==null?'—':(totalDurationMs/1000).toFixed(2)+' s'}}</text>
</svg></template>
<style scoped>.tool-sequence-svg{width:100%;min-width:750px;display:block;font:13px "Microsoft YaHei",Arial,sans-serif}.tool-sequence-svg g[role=button]{cursor:pointer}.tool-sequence-svg g[role=button]:focus{outline:none;filter:drop-shadow(0 0 2px #7ca9ff)}.return-caption{text-align:center;font-size:12px;color:#263d60;white-space:nowrap;line-height:22px}.return-caption span{padding:2px 8px;border-radius:4px;font-weight:700}.success{background:#d5f6df;color:#1aa34c}.danger{background:#ffe1e4;color:#f02b42}.warning{background:#fff0bf;color:#d89200}</style>
''')
p=Path('src/views/compliance/components/agent-traces/ToolsView.vue');s=p.read_text(encoding='utf-8');s=s.replace("import { useRouter }", "import ToolGlyph from './ToolGlyph.vue'\nimport ToolSequence from './ToolSequence.vue'\nimport { useRouter }")
s=s.replace("['♧','调用'", "['phone','调用'").replace("['▱','工具种类'","['layers','工具种类'").replace("['✓','成功'","['check','成功'").replace("['♧','越权'","['shield','越权'").replace("['×','错误'","['error','错误'").replace("['◷','低效'","['clock','低效'")
s=s.replace("${s.scenarioLabel ? ' · ' + s.scenarioLabel : ''}", '')
s=s.replace('<span>{{c[0]}}</span><b>{{c[1]}}</b><strong>{{c[2]}}</strong> {{c[3]}}','<ToolGlyph :name="String(c[0])"/><b>{{c[1]}}</b><div class="metric-value"><strong>{{c[2]}}</strong><span>{{c[3]}}</span></div>')
a=s.index('<svg v-else :viewBox=');b=s.index('</svg>',a)+6;s=s[:a]+'''<ToolSequence v-else :items="result.sequence.items" :participants="result.sequence.participants" :total-duration-ms="result.timing.totalDurationMs" @select="selectCall"/>'''+s[b:]
s=s.replace('<table><thead><tr><th v-for="h', '<table class="tool-calls"><colgroup><col v-for="w in [8,8,8,7,8,10,21,18,12]" :key="w+Math.random()" :style="{width:w+\'%\'}"/></colgroup><thead><tr><th v-for="h')
s=s.replace(':key="w+Math.random()"', ':key="index"').replace('v-for="w in [8,8,8,7,8,10,21,18,12]"','v-for="(w,index) in [8,8,8,7,8,10,21,18,12]"')
s=s.replace('<td>{{c.toolName}}</td>', '<td>{{c.toolName.split(\'.\').at(-1)}}</td>')
s=s.replace('◎ 定位思维步骤', '<ToolGlyph name="locate"/>定位思维步骤').replace('@click="showRaw">原始事件', '@click="showRaw"><ToolGlyph name="document"/>原始事件')
s=s.replace('<td>{{value}}</td>', '''<td><span :class="label==='权限校验结果'&&selected.permissionDecision==='denied'?'overreach':label==='执行状态'?selected.executionStatus:''">{{value}}</span></td>''')
s=s.replace('<table><thead><tr><th>维度</th>', '<table class="tool-permissions"><colgroup><col style="width:24%"/><col style="width:27%"/><col style="width:33%"/><col style="width:16%"/></colgroup><thead><tr><th>维度</th>')
s=s.replace('<p class="tool-explanation">{{selected.analysis.errorAttribution?.message', '<p class="tool-explanation"><ToolGlyph v-if="selected.analysis.errorAttribution" name="error" class="error-icon"/>{{selected.analysis.errorAttribution?.message')
s=s.replace('class="tool-explanation"><button @click="selectCall(g.canonicalCallId)">{{g.canonicalCallId}}', 'class="tool-explanation"><ToolGlyph name="clock" class="warning-icon"/><button @click="selectCall(g.canonicalCallId)">{{displayCall(g.canonicalCallId)}}').replace('{{id}}</button>：{{g.reason}}','{{displayCall(id)}}</button>：{{g.reason}}')
s=s.replace('const status=', "const displayCall=(id:string)=>result.value?.calls.items.find(c=>c.callId===id)?.displayId||result.value?.sequence.items.find(c=>c.callId===id)?.displayId||id\nconst status=")
# Restrict generic link styling to native table/evidence links, not Element Plus buttons.
s=s.replace('}button{border:0;', '}button:not(.el-button){border:0;')
s += '''
<style>
/* Every selector is gated by the tools view; sibling pages retain their styles. */
.agent-traces:has(> .tools-view) .at-tabs{border:0;border-bottom:1px solid #dae7fb;border-radius:0;background:transparent;margin-bottom:0}
.agent-traces:has(> .tools-view) .at-tabs>button{width:185px;padding:10px 16px;font-size:16px;line-height:20px;border:0;border-radius:5px 5px 0 0;color:#233b60}
.agent-traces:has(> .tools-view) .at-tabs>button.active{background:linear-gradient(#4488ff,#146df5);color:white}
.agent-traces:has(> .tools-view) .at-heading{margin:12px 0 4px}
.agent-traces:has(> .tools-view) .at-heading h1{font-size:27px;color:#142e54}
.agent-traces:has(> .tools-view) .at-heading .el-button{height:36px;font-size:14px;padding:0 16px;font-weight:600}
.agent-traces:has(> .tools-view) .at-page{font-size:14px;color:#203858}
.tools-view .tools-query{padding:10px 12px;gap:18px;height:54px;box-sizing:border-box}
.tools-view .tools-query>b{color:#152e54;font-size:14px}
.tools-view .tools-query>.el-select{width:205px}
.tools-view .tools-query .el-select__selected-item{font-weight:600;color:#223b60}
.tools-view .tools-query>.el-button{height:34px;min-width:80px;background:#146df5;color:white;border:1px solid #146df5;border-radius:5px;font-weight:600;font-size:14px}
.tools-view .tools-result{padding:9px 12px;font-size:14px;line-height:20px;margin-bottom:12px;color:#243f6b;font-weight:500}
.tools-view .tools-metrics{height:84px;flex-wrap:nowrap;gap:10px;padding:8px 14px;margin-bottom:12px}
.tools-view .tools-metrics>h3{font-size:18px;display:flex;align-items:center;gap:5px;margin:0;min-width:255px;color:#172d50}
.tools-view .tools-metrics>h3 small{font-size:12px;white-space:nowrap}
.tools-view .tool-metric{height:66px;min-width:0;flex:0 0 104px;padding:7px 10px;box-sizing:border-box;border:1px solid #dbe7fa;background:#f8fbff;display:grid;grid-template-columns:26px 1fr;grid-template-rows:22px 29px;column-gap:7px;text-align:center}
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
.tools-view .tool-sequence{height:350px;max-height:450px;overflow:auto}
.tools-view table{table-layout:fixed;width:100%;font-family:"Microsoft YaHei",Arial,sans-serif;font-size:12px;border-collapse:collapse}
.tools-view table th,.tools-view table td{box-sizing:border-box;height:29px;padding:4px 8px;border:1px solid #dae6f8;font-size:12px;line-height:19px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:transparent;color:#23354f}
.tools-view table th{font-weight:700;background:#e6effc;text-align:left}
.tools-view table thead th{font-size:12px}
.tools-view .tool-calls{min-width:1010px}
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
@media(max-width:1500px){.tools-view .tools-metrics{height:auto;flex-wrap:wrap}.tools-view .tool-timing{flex:1}.tools-view .tool-metric{flex-basis:100px}}
@media(max-width:1100px){.tools-view .tools-columns{grid-template-columns:1fr}.tools-view .tool-sequence{height:auto}.tools-view .tools-query{height:auto;flex-wrap:wrap}}
</style>
'''
p.write_text(s,encoding='utf-8')
