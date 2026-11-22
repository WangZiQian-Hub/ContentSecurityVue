<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { fetchCompetitionReport } from '../../../../api/agent-traces'

type Evidence = { step_id?: number; message_index?: number; quote: string }
type Issue = {
  step_id?: number
  message_index?: number
  previous_step_id?: number
  rule_id?: string
  source_subitem?: string
  error_type?: string
  field?: string
  issue?: string
  risk_quote?: string
  evidence?: Evidence[]
}
type ToolCall = {
  step_id: number
  message_index: number
  tool_name: string
  arguments: string
  returns: { content: unknown; message_index: number }[]
}
type Results = {
  A1: { input_tokens: number | string; output_tokens: number | string }
  A2: { known_characters: number; absent_body_step_ids: number[] }
  A3: { tool_calls: number; tool_kinds: number; tool_counts: Record<string, number> }
  B1: { segments: { step_id: number; step_ids?: number[]; text: string }[]; absent_body_step_ids: number[] }
  B2: { judgment: string }
  B3: { risks: Issue[] }
  C1: { calls: ToolCall[]; unmatched: (Issue & { content: unknown })[] }
  C2: { markers: Issue[] }
  C3: { failures: Issue[] }
  C4: { completion: boolean | string | null; missing_fields: Issue[]; unmatched: Issue[]; truncations: (Issue & { quote?: string; value?: unknown })[] }
  C5: { issues: Issue[] }
}
type Sample = { trajectory_id: string; results: Results }
type Aggregate = { trajectory_id: 'aggregate'; results: { A4: { tool_calls: number; tool_counts: Record<string, number> } } }
const props = defineProps<{ batchId: string; snapshotId: string }>()
const open = defineModel<boolean>({ required: true })
const loading = ref(false)
const error = ref('')
const jsonl = ref('')
const rows = shallowRef<(Sample | Aggregate)[]>([])
const samples = computed(() => rows.value.filter((row): row is Sample => 'A1' in row.results))
const summary = computed(() => rows.value.find((row): row is Aggregate => 'A4' in row.results)?.results.A4)
const formattedJson = computed(() => JSON.stringify(rows.value, null, 2) + '\n')
const selected = ref('')
const active = ref('statistics')
const callOpen = ref<number[]>([])
const result = computed(() => samples.value.find(row => row.trajectory_id === selected.value)?.results)
const errors = computed(() => result.value ? [...result.value.C2.markers, ...result.value.C3.failures, ...result.value.C4.missing_fields] : [])
const completion = computed(() => {
  const value = result.value?.C4.completion
  return value === true ? '已完成' : value === false ? '未完成' : value === null ? '原始记录为 null' : '未提供'
})
watch([open, () => props.batchId, () => props.snapshotId], async ([visible, batch, snapshot], _, cleanup) => {
  if (!visible) return
  const controller = new AbortController()
  cleanup(() => controller.abort())
  loading.value = true
  error.value = jsonl.value = selected.value = ''
  rows.value = []
  try {
    const data = await fetchCompetitionReport(batch, snapshot, controller.signal)
    if (controller.signal.aborted) return
    rows.value = data.jsonl.trimEnd().split('\n').map(line => JSON.parse(line) as Sample | Aggregate)
    selected.value = samples.value[0]?.trajectory_id || ''
    jsonl.value = data.jsonl
    active.value = 'statistics'
  } catch (e) {
    if (!controller.signal.aborted) error.value = e instanceof Error ? e.message : '赛题报告读取失败'
  } finally {
    if (!controller.signal.aborted) loading.value = false
  }
})
watch(selected, () => { callOpen.value = [] })

function download(content: string, filename: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType + ';charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function location(item: Issue) {
  if (item.step_id !== undefined) return `第 ${item.step_id} 步`
  return item.message_index !== undefined ? `原消息下标 ${item.message_index}` : item.field || '轨迹元数据'
}

async function goToCall(step: number) {
  active.value = 'tools'
  callOpen.value = [step]
  await nextTick()
  document.getElementById(`competition-call-${step}`)?.scrollIntoView({ block: 'nearest' })
}

function print(value: unknown) {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? '未提供'
}
</script>

<template>
  <el-dialog v-model="open" title="赛题二 · 批次审计报告" width="min(1120px, 94vw)" class="competition-report-dialog" destroy-on-close>
    <el-alert v-if="error" type="error" :closable="false" :title="error" />
    <p v-else-if="loading" role="status">正在读取批次审计报告…</p>
    <div v-else-if="result" class="competition-report">
      <div class="report-controls">
        <el-select v-model="selected" aria-label="赛题轨迹" popper-class="competition-report-select-popper" filterable>
          <el-option v-for="row in samples" :key="row.trajectory_id" :value="row.trajectory_id" :label="row.trajectory_id" />
        </el-select>
        <el-button
          type="primary"
          @click="download(jsonl, 'submission.jsonl', 'application/x-ndjson')"
        >下载 submission.jsonl</el-button>
      </div>
      <el-tabs v-model="active" class="report-tabs">
        <el-tab-pane name="statistics" label="统计指标">
          <p class="report-summary">本轨迹输入 {{ result.A1.input_tokens }} Token，输出 {{ result.A1.output_tokens }} Token。</p>
          <p class="report-summary">已保存思考正文 {{ result.A2.known_characters }} 字符。工具调用 {{ result.A3.tool_calls }} 次，涉及 {{ result.A3.tool_kinds }} 种工具。</p>
          <dl class="tool-counts">
            <div v-for="(count, name) in result.A3.tool_counts" :key="name" class="report-tool-count"><dt>{{ name }}</dt><dd>{{ count }} 次</dd></div>
          </dl>
          <template v-if="summary">
            <h3>批次汇总</h3>
            <p class="report-summary">{{ samples.length }} 条轨迹，共 {{ summary.tool_calls }} 次调用。</p>
            <dl class="tool-counts">
              <div v-for="(count, name) in summary.tool_counts" :key="name" class="report-tool-count"><dt>{{ name }}</dt><dd>{{ count }} 次</dd></div>
            </dl>
          </template>
        </el-tab-pane>
        <el-tab-pane name="reasoning" label="思考与风险" lazy>
          <p>审计结论 {{ result.B2.judgment }}。请结合原始证据复核。</p>
          <details v-for="risk in result.B3.risks" :key="risk.step_id">
            <summary>首次风险 · {{ location(risk) }}<span v-if="risk.rule_id === 'other'"> · other</span></summary>
            <pre>{{ risk.risk_quote }}</pre>
            <template v-for="(entry, i) in risk.evidence" :key="i">
              <p>{{ location(entry) }} · 原文证据</p><pre>{{ entry.quote }}</pre>
            </template>
            <el-button v-if="risk.step_id !== undefined && result.C1.calls.some(call => call.step_id === risk.step_id)" link type="primary" @click="goToCall(risk.step_id)">查看对应工具调用</el-button>
          </details>
          <p v-if="result.B1.absent_body_step_ids.length">未提供思考正文的步骤 {{ result.B1.absent_body_step_ids.join('、') }}</p>
          <details v-for="segment in result.B1.segments" :key="segment.step_id">
            <summary>思考原文 · 第 {{ (segment.step_ids || [segment.step_id]).join('、') }} 步</summary>
            <pre>{{ segment.text }}</pre>
          </details>
        </el-tab-pane>
        <el-tab-pane name="tools" label="工具调用与完整性" lazy>
          <p>会话完成状态 {{ completion }}。未配对 {{ result.C1.unmatched.length }}，明确截断 {{ result.C4.truncations.length }}。</p>
          <p v-for="(item, i) in errors" :key="i">{{ location(item) }} · {{ item.error_type || item.issue || '重复调用' }}<span v-if="item.rule_id === 'other'"> · other</span></p>
          <details v-for="(item, i) in result.C5.issues" :key="'issue-' + i">
            <summary>{{ item.source_subitem }} · {{ location(item) }}<span v-if="item.rule_id === 'other'"> · other</span> · 查看证据</summary>
            <template v-for="(entry, j) in item.evidence" :key="j"><p>{{ location(entry) }}</p><pre>{{ entry.quote }}</pre></template>
            <el-button v-if="item.step_id !== undefined" link type="primary" @click="goToCall(item.step_id)">查看对应工具调用</el-button>
            <el-button v-if="item.previous_step_id !== undefined" link type="primary" @click="goToCall(item.previous_step_id)">查看前次调用</el-button>
          </details>
          <details v-for="(item, i) in result.C1.unmatched" :key="'unmatched-' + i">
            <summary>未配对 · {{ location(item) }}</summary><pre>{{ print(item.content) }}</pre>
          </details>
          <el-collapse v-model="callOpen">
            <el-collapse-item v-for="call in result.C1.calls" :id="`competition-call-${call.step_id}`" :key="call.step_id" :name="call.step_id" :title="`第 ${call.step_id} 步 · ${call.tool_name || '工具名称未提供'}`">
              <p>原始参数 · 消息下标 {{ call.message_index }}</p><pre>{{ print(call.arguments) }}</pre>
              <p v-if="!call.returns.length">未找到对应返回</p>
              <template v-for="returned in call.returns" :key="returned.message_index"><p>原始返回 · 消息下标 {{ returned.message_index }}</p><pre>{{ print(returned.content) }}</pre></template>
            </el-collapse-item>
          </el-collapse>
        </el-tab-pane>
        <el-tab-pane name="formatted" label="格式化预览" lazy>
          <div class="report-controls">
            <el-button
              @click="download(formattedJson, 'submission-readable.json', 'application/json')"
            >下载可读版 JSON</el-button>
            <span>包含本批次全部轨迹和汇总。正式提交使用 submission.jsonl。</span>
          </div>
          <pre v-if="active === 'formatted'" class="report-json" tabindex="0" aria-label="格式化赛题结果">{{ formattedJson }}</pre>
        </el-tab-pane>
      </el-tabs>
    </div>
  </el-dialog>
</template>

<style scoped>
:global(.competition-report-dialog) { border-radius: 12px; }
:global(.competition-report-dialog .el-dialog__header) { padding: 20px 24px 16px; margin: 0; border-bottom: 1px solid #e2eaf6; }
:global(.competition-report-dialog .el-dialog__title) { color: #17345e; font-size: 24px; font-weight: 700; }
:global(.competition-report-dialog .el-dialog__body) { padding: 20px 24px 24px; }
:global(.competition-report-dialog .el-dialog__body > p) { font-size: 16px; line-height: 1.7; }
:global(.competition-report-select-popper .el-select-dropdown__item) { font-size: 16px; }
.competition-report { max-height: 72vh; overflow: auto; padding-right: 4px; color: #263b5a; font-size: 16px; line-height: 1.7; }
.report-controls { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
.report-controls .el-select { width: min(380px, 100%); }
.report-controls .el-button, .report-controls :deep(.el-select__selected-item) { font-size: 17px; }
.report-controls span { color: #6d7f9c; font-size: 14px; }
.report-tabs :deep(.el-tabs__header) { margin-bottom: 18px; }
.report-tabs :deep(.el-tabs__item) { font-size: 17px; }
.report-tabs :deep(.el-collapse-item__header) { font-size: 16px; font-weight: 600; }
.report-tabs :deep(.el-collapse-item__content) { font-size: 16px; line-height: 1.7; }
.report-summary { margin: 0 0 10px; padding: 12px 16px; border: 1px solid #e2eafa; border-radius: 8px; background: #f7faff; font-size: 18px; line-height: 1.6; }
.competition-report h3 { margin: 24px 0 12px; color: #17345e; font-size: 20px; line-height: 1.4; }
.tool-counts { display: grid; grid-template-columns: repeat(auto-fit, minmax(185px, 1fr)); gap: 10px; margin: 14px 0 20px; }
.report-tool-count { display: flex; justify-content: space-between; align-items: center; gap: 12px; min-width: 0; padding: 10px 12px; border: 1px solid #e1eaf8; border-radius: 8px; background: #fff; }
.report-tool-count dt { min-width: 0; color: #61789d; font-size: 16px; overflow-wrap: anywhere; }
.report-tool-count dd { flex: none; margin: 0; color: #254ed7; font-size: 18px; font-weight: 700; }
details { margin: 10px 0; padding: 10px 14px; border: 1px solid #e2eafa; border-radius: 8px; background: #fbfdff; }
summary { cursor: pointer; color: #17345e; font-size: 17px; font-weight: 600; }
details[open] summary { margin-bottom: 10px; }
.competition-report p { overflow-wrap: anywhere; }
pre { max-height: 32vh; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; margin: 10px 0; padding: 12px 14px; border-radius: 6px; background: #f3f7fc; color: #213a5c; font: 15px/1.65 Consolas, monospace; }
.report-json { max-height: 52vh; tab-size: 2; font-size: 14.5px; }
@media (max-width: 640px) {
  :global(.competition-report-dialog .el-dialog__header) { padding: 16px; }
  :global(.competition-report-dialog .el-dialog__body) { padding: 16px; }
  .report-controls .el-select { width: 100%; }
  .tool-counts { grid-template-columns: minmax(0, 1fr); }
}
</style>
