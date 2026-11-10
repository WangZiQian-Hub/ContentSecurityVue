<script setup lang="ts">
import './agent-trace-shared.css'
import { traceBatchLabel } from '../../utils/agent-trace-presentation'
import ViewExportStatus from './components/agent-traces/ViewExportStatus.vue'
const autoViewExport = ref(false)
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useComplianceStore } from '../../stores/compliance'
import { useAgentTraceStore } from '../../stores/agent-traces'
import { downloadTraceTicket } from '../../api/agent-traces'
import PanelCard from '../../components/PanelCard.vue'
import AppIcon from '../../components/AppIcon.vue'
import TraceFormatIcon from './components/TraceFormatIcon.vue'
import TraceStatisticsPage from './components/agent-traces/TraceStatisticsPage.vue'
import ToolsView from './components/agent-traces/ToolsView.vue'
import ExecutionView from './components/agent-traces/ExecutionView.vue'
import { agentTraceTabQuery } from '../../utils/agent-trace-navigation'
import type { Command, Format, View } from '../../types/agent-traces'
const parent = useComplianceStore(),
  store = useAgentTraceStore(),
  route = useRoute(),
  router = useRouter()
const views: { code: View; label: string }[] = [
  { code: 'ingest', label: '轨迹接入与校验' },
  { code: 'statistics', label: '统计指标' },
  { code: 'execution', label: '思维路径' },
  { code: 'tools', label: '工具交互' },
]
const view = computed(() =>
  views.some((v) => v.code === route.query.view) ? (String(route.query.view) as View) : 'ingest',
)
const index = computed(() => views.findIndex((v) => v.code === view.value))
const toolsPage = ref<InstanceType<typeof ToolsView>>()
const executionPage = ref<InstanceType<typeof ExecutionView>>()
const statisticsPage = ref<InstanceType<typeof TraceStatisticsPage>>()
// Text-only highlighting: preserve source bytes and never inject log HTML.
function sourceTokens(line: string) {
  const tokens: { text: string; kind: string }[] = []
  const pattern = /"(?:\\.|[^"\\])*"|\b(?:true|false|null|\d+(?:\.\d+)?)\b/g
  let offset = 0
  for (const match of line.matchAll(pattern)) {
    const at = match.index!
    if (at > offset) tokens.push({ text: line.slice(offset, at), kind: '' })
    tokens.push({
      text: match[0],
      kind: match[0].startsWith('"')
        ? line
            .slice(at + match[0].length)
            .trimStart()
            .startsWith(':')
          ? 'key'
          : 'string'
        : 'literal',
    })
    offset = at + match[0].length
  }
  if (offset < line.length) tokens.push({ text: line.slice(offset), kind: '' })
  return tokens
}
const w = computed(() => store.workspace),
  d = computed(() => store.detail)
const rawPreviewLines = computed(() => {
  const raw = d.value?.rawPreview.rawText ?? ''
  try {
    return JSON.stringify(JSON.parse(raw), null, 2).split('\n')
  } catch {
    return raw.split('\n')
  }
})
const normalizedFields = computed(() => [
  { label: 'trace_id', value: d.value?.displayId || '未提供', title: d.value?.traceId },
  { label: 'event_type', value: d.value?.normalizedEvent?.eventType || '未提供' },
  { label: 'tool_name', value: d.value?.normalizedEvent?.toolName || '不适用' },
  { label: 'source_ref', value: d.value?.sourceRef.sourcePath || '未提供' },
  { label: 'event_id', value: d.value?.normalizedEvent?.eventId || '未提供', wide: true, copyValue: d.value?.normalizedEvent?.eventId },
  { label: 'call_id', value: d.value?.normalizedEvent?.callId || '不适用', wide: true, copyValue: d.value?.normalizedEvent?.callId },
])
const previewEvents = computed(() => d.value?.eventOptions ?? d.value?.events.items ?? [])
const previewEventIndex = computed(() => previewEvents.value.findIndex(e => e.eventId === d.value?.selectedEventId))
const eventTypeLabels: Record<string, string> = {
  user: '用户输入', thought: '已记录推理', tool_call: '工具调用', tool_result: '工具返回',
  final: '最终回答', error: '运行错误', system: '系统消息', message: '消息', run: '运行记录',
  recorded_step: '已记录步骤', policy_decision: '策略判定',
}
function selectPreviewEvent(eventId: string) {
  if (d.value) store.select(d.value.traceId, eventId, 1, store.query.eventTypes)
}
function movePreviewEvent(offset: number) {
  const event = previewEvents.value[previewEventIndex.value + offset]
  if (event) selectPreviewEvent(event.eventId)
}
const example = ref<Format | null>(null),
  batchDialog = ref(false),
  batchName = ref(''),
  exportDialog = ref(false),
  exportScope = ref('batch'),
  contents = ref(['normalized_json', 'offline_html', 'evidence_index', 'manifest']),
  search = ref(''),
  preview = ref<HTMLElement>(),
  defaultFormat = ref('auto')
const queue = ref<{ file: File; fileId?: string; state: string; error: string }[]>([])
let pageAlive = true
let modeVersion = 0
const labels: Record<string, string> = {
  structure: '结构有效',
  call_link: '调用关联',
  time: '时间信息',
  usage: '用量信息',
  time_missing: '时间信息缺失',
  usage_missing: 'Token 用量缺失',
  call_unlinked: '调用关联异常',
  normalized_json: '标准化 JSON',
  offline_html: '离线 HTML 报告',
  evidence_index: '证据索引',
  manifest: 'manifest 清单',
  error_report: '错误清单',
  pending: '待解析',
  succeeded: '解析成功',
  partial: '部分成功',
  failed: '解析失败',
  running: '处理中',
}
function setView(v: View) {
  if (v === view.value) return
  router.replace({ query: agentTraceTabQuery(route.query, v) })
}
function syncUrl() {
  const q = store.query
  router.replace({
    query: {
      view: view.value,
      ...Object.fromEntries(
        ['batchId', 'sourceId', 'snapshotId', 'traceId', 'eventId', 'issueType'].flatMap((k) =>
          q[k as keyof typeof q] ? [[k, String(q[k as keyof typeof q])]] : [],
        ),
      ),
    },
  })
}
async function refresh() {
  await store.load(store.query)
  store.resume()
}
watch(
  () => parent.demo,
  async (mode, previousMode) => {
    const currentModeVersion = ++modeVersion
    store.configure(mode)
    queue.value = []
    example.value = null
    exportDialog.value = false
    batchDialog.value = false
    search.value = ''
    if (view.value === 'statistics' || view.value === 'execution' || view.value === 'tools') return
    // IDs from the other execution mode do not refer to objects in this mode.
    if (previousMode !== undefined) {
      await router.replace({ query: { view: view.value } })
      if (!pageAlive || currentModeVersion !== modeVersion) return
      await store.load({})
      return
    }
    await store.load(
      Object.fromEntries(
        ['batchId', 'sourceId', 'snapshotId', 'traceId', 'eventId', 'issueType'].flatMap((k) =>
          typeof route.query[k] === 'string' ? [[k, route.query[k]]] : [],
        ),
      ),
    )
    store.resume()
  },
  { immediate: true },
)
watch(view, async (next, previous) => {
  if (next === 'execution' || next === 'tools') {
    store.dispose()
    return
  }
  if (next === 'statistics') return
  if (previous === 'statistics' || previous === 'execution' || previous === 'tools') {
    await store.load(
      Object.fromEntries(
        ['batchId', 'snapshotId', 'traceId', 'eventId'].flatMap((k) =>
          typeof route.query[k] === 'string' ? [[k, route.query[k]]] : [],
        ),
      ),
    )
    return
  }
  if (store.detail)
    await store.select(
      store.detail.traceId,
      undefined,
      1,
      view.value === 'tools' ? 'tool_call,tool_result' : undefined,
    )
})
watch(
  () => [store.query, store.loading],
  () => {
    if (view.value === 'ingest' && store.workspace?.batch && !store.loading) syncUrl()
  },
  { deep: true },
)
function openBatch() { batchName.value = ''; batchDialog.value = true }
async function createBatch() {
  await store.create(batchName.value.trim())
  if (!store.actionError) {
    batchDialog.value = false
    syncUrl()
  }
}
async function changeSource(sourceId: string) {
  await store.load({ sourceId })
  syncUrl()
}
async function changeBatch(batchId: string) {
  await store.load({ batchId })
  syncUrl()
}
async function choose(traceId: string) {
  await store.select(
    traceId,
    undefined,
    1,
    view.value === 'tools' ? 'tool_call,tool_result' : undefined,
  )
  syncUrl()
}
async function locate(code: string) {
  await store.load({
    batchId: store.query.batchId,
    snapshotId: store.query.snapshotId,
    issueType: code,
  })
  syncUrl()
  await nextTick()
  preview.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
async function filesChanged(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  const policy = w.value?.uploadPolicy
  if (!policy) return
  if (files.length > policy.maxFilesPerRequest) {
    store.actionError = '一次最多上传 ' + policy.maxFilesPerRequest + ' 个文件'
    return
  }
  for (const file of files) {
    queue.value.push({
      file,
      state: '待上传',
      error:
        policy.allowedExtensions.some((e) => file.name.toLowerCase().endsWith(e)) &&
        file.size <= policy.maxFileBytes
          ? ''
          : '文件格式或大小不符合限制',
    })
  }
  await uploadPending()
}
async function uploadPending() {
  await store.action(async () => {
    if (!w.value?.batch) throw new Error('请先创建批次')
    const batchId = w.value.batch.batchId
    for (const row of queue.value.filter((r) => !r.fileId && !r.error)) {
      const policy = w.value?.uploadPolicy
      if (
        !policy ||
        row.file.size > policy.maxFileBytes ||
        !policy.allowedExtensions.some((e) => row.file.name.toLowerCase().endsWith(e))
      ) {
        row.error = '文件格式或大小不符合限制'
        continue
      }
      row.state = '上传中'
      try {
        const result = await store.upload(row.file)
        if (!pageAlive) return
        row.fileId = result.fileId
        row.state = '已上传，待绑定'
      } catch (e) {
        row.state = '上传失败'
        row.error = e instanceof Error ? e.message : '上传失败'
      }
    }
    if (batchId !== store.workspace?.batch?.batchId) return
    const ready = queue.value.filter((r) => r.fileId)
    if (ready.length) {
      await store.bind(
        ready.map((r) => ({ fileId: r.fileId!, formatOverride: defaultFormat.value })),
      )
      queue.value = queue.value.filter((r) => !r.fileId)
    }
  })
}
function retryUpload(row: { error: string }) {
  row.error = ''
  return uploadPending()
}
async function override(fileId: string, formatOverride: string) {
  await store.action(() => store.bind([{ fileId, formatOverride }]))
}
async function parse(mode = 'parse_pending') {
  autoViewExport.value = false
  const b = w.value?.batch
  if (!b) return
  await store.submit({
    capabilityCode: 'agent_trace_ingest',
    name: '智能体轨迹解析与规则审计',
    input: {
      batchId: b.batchId,
      expectedVersion: b.batchVersion,
      mode,
    },
  })
}
const working = computed(
  () => store.busy || (!!store.task && ['pending', 'running'].includes(store.task.status)),
)
const canExport = computed(
  () => !!w.value?.batch?.activeSnapshotId && w.value.validation.canContinue,
)
async function exportResult(kind: 'view' | 'package') {
  store.task = null
  autoViewExport.value = kind === 'view'
  const b = w.value?.batch
  if (!b?.activeSnapshotId) return
  const input: Command['input'] = {
    batchId: b.batchId,
    snapshotId: store.query.snapshotId,
    exportKind: kind,
    format: kind === 'view' ? 'png' : 'zip',
    view: view.value,
    selectedTraceId: store.query.traceId,
    selectedEventId: store.query.eventId,
    scope: {
      type: kind === 'view' ? 'filtered' : exportScope.value,
      sourceId: store.query.sourceId || null,
      traceIds: store.query.traceId ? [store.query.traceId] : [],
      issueType: store.query.issueType || null,
      q: store.query.q || null,
    },
    contents:
      kind === 'view'
        ? [
            `${view.value === 'ingest' ? 'ingest' : view.value === 'execution' ? 'execution' : view.value === 'tools' ? 'tools' : 'statistics'}_png`,
          ]
        : [...new Set([...contents.value, 'manifest'])],
    redactionProfile: 'standard',
    anonymizeIds: true,
    locale: 'zh-CN',
    timezone: 'Asia/Shanghai',
    uiVersion: '1',
  }
  await store.submit({
    capabilityCode: 'agent_trace_export',
    name: kind === 'view' ? '当前视图导出' : '轨迹结果包导出',
    input,
  })
  if (!store.actionError) exportDialog.value = false
}
function saveText(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function copy(text: string) {
  await store.action(async () => {
    await navigator.clipboard.writeText(text)
  })
}
async function download(id: string) {
  await store.action(async () => {
    await downloadTraceTicket(await store.ticket(id), store.demo)
  })
}
const pngAllowed = computed(
  () =>
    store.demo ||
    w.value?.exportOptions.contents.some(
      (c) =>
        c.code === `${view.value === 'ingest' ? 'ingest' : view.value}_png` &&
        c.availability === 'available',
    ),
)
onUnmounted(() => {
  pageAlive = false
  store.dispose()
})
</script>
<template>
  <div
    class="agent-traces"
    :class="{
      'at-ingest': view === 'ingest',
      'at-execution': view === 'execution' || view === 'tools',
    }"
  >
    <header class="at-heading">
      <h1>智能体轨迹审计</h1>
      <div>
        <el-button
          :type="
            view === 'statistics' || view === 'execution' || view === 'ingest' || view === 'tools'
              ? 'primary'
              : undefined
          "
          :plain="
            view === 'statistics' || view === 'execution' || view === 'ingest' || view === 'tools'
          "
          :disabled="
            view === 'tools'
              ? !toolsPage?.canView
              : view === 'execution'
                ? !executionPage?.canView
                : view === 'statistics'
                  ? !statisticsPage?.canView
                  : !canExport || !pngAllowed || working
          "
          title="按当前快照和筛选导出完整分析画布；渲染器不可用时禁用"
          @click="
            view === 'tools'
              ? toolsPage?.exportView()
              : view === 'execution'
                ? executionPage?.exportView()
                : view === 'statistics'
                  ? statisticsPage?.exportView()
                  : exportResult('view')
          "
          ><AppIcon name="Download" />导出当前视图</el-button
        ><el-button
          type="primary"
          :disabled="
            view === 'tools'
              ? !toolsPage?.canView
              : view === 'execution'
                ? !executionPage?.canPackage
                : view === 'statistics'
                  ? !statisticsPage?.canPackage
                  : !canExport || working
          "
          @click="
            view === 'tools'
              ? toolsPage?.openPackage()
              : view === 'execution'
                ? executionPage?.openPackage()
                : view === 'statistics'
                  ? statisticsPage?.openPackage()
                  : (exportDialog = true)
          "
          >导出结果包</el-button
        >
      </div>
    </header>
    <nav class="at-tabs" aria-label="智能体轨迹审计页面">
      <button
        v-for="v in views"
        :key="v.code"
        :class="{ active: view === v.code }"
        :aria-current="view === v.code ? 'page' : undefined"
        @click="setView(v.code)"
      >
        {{ v.label }}</button
      ><span class="at-page"
        ><el-button
          text
          :disabled="index === 0"
          aria-label="上一页签"
          @click="setView(views[index - 1].code)"
          >‹</el-button
        >{{ String(index + 1).padStart(2, '0') }}/04<el-button
          text
          :disabled="index === 3"
          aria-label="下一页签"
          @click="setView(views[index + 1].code)"
          >›</el-button
        ></span
      >
    </nav>
    <ToolsView v-if="view === 'tools'" ref="toolsPage" />
    <ExecutionView v-else-if="view === 'execution'" ref="executionPage" />
    <TraceStatisticsPage v-else-if="view === 'statistics'" ref="statisticsPage" />
    <template v-else>
      <el-alert
        v-if="store.error || store.actionError"
        :title="store.error || store.actionError"
        type="error"
        :closable="false"
        show-icon
      /><el-button v-if="store.error" @click="refresh">重试工作区</el-button>
      <ViewExportStatus
        v-if="autoViewExport && (store.task || working || store.actionError)"
        :task="store.task"
        :error="store.actionError"
        :download="(a) => download(a.artifactId)"
      />
      <div v-if="store.task && !autoViewExport" class="at-task" role="status">
        <span
          >{{ store.task.result?.kind === 'agent_trace_ingest' ? '解析与规则审计' : '导出任务' }} ·
          {{ store.task.status }} · {{ store.task.result?.batchId }}</span
        ><el-progress v-if="working" :percentage="store.task.progress || 0" /><span
          v-if="store.task.result?.outcome === 'partial'"
          >部分记录失败，请检查文件错误</span
        ><el-button
          v-if="['pending', 'running'].includes(store.task.status)"
          text
          @click="store.resume"
          >恢复进度查询</el-button
        ><el-button
          v-for="a in store.task.result?.artifacts || []"
          :key="a.artifactId"
          @click="download(a.artifactId)"
          >下载 {{ a.filename }}</el-button
        >
      </div>
      <div v-if="store.loading" class="at-loading" aria-busy="true">正在加载批次与来源…</div>
      <el-empty v-if="!w && !store.loading && !store.error" description="工作区尚未加载，请重新加载"
        ><el-button type="primary" @click="refresh">重新加载工作区</el-button></el-empty
      >
      <template v-if="w">
        <el-alert v-if="w.batch?.activeSnapshotId && store.query.snapshotId && w.batch.activeSnapshotId !== store.query.snapshotId" title="当前为历史快照，后台已有新的解析或审计结果。" type="info" :closable="false"><el-button link @click="store.load({ batchId: store.query.batchId, traceId: store.query.traceId })">查看最新结果</el-button></el-alert>
        <el-alert
          v-if="!w.batch"
          title="暂无轨迹批次，请先新建批次，再上传外部轨迹文件。"
          type="info"
          :closable="false"
        />
        <template v-if="view === 'ingest'">
          <div class="at-formats">
            <section v-for="f in w.formats" :key="f.code" class="at-format">
              <div class="at-format-icon"><TraceFormatIcon :code="f.code" /></div>
              <div>
                <h3>{{ f.label }}</h3>
                <p class="at-format-description">
                  <span>格式：{{ f.containers.join(' / ') }}</span
                  ><span class="at-description-divider">|</span
                  ><span>能力：支持 {{ f.description }}</span>
                </p>
                <div class="at-format-bottom">
                  <span
                    :class="
                      w.summary.byFormat.find((r) => r.code === f.code)?.traceCount
                        ? 'at-success'
                        : 'at-muted'
                    "
                    >{{
                      w.summary.byFormat.find((r) => r.code === f.code)?.traceCount
                        ? `✓ 本批次已接入 · ${w.summary.byFormat.find((r) => r.code === f.code)?.traceCount} 条`
                        : '● 支持接入 · 本批次未接入'
                    }}</span
                  ><el-button link type="primary" @click="example = f">查看格式示例 →</el-button>
                </div>
              </div>
            </section>
          </div>
          <el-alert v-if="w.auditSummary" :title="`规则审计：${w.auditSummary.completedSamples} / ${w.auditSummary.totalSamples} 条已完成；安全风险 ${w.auditSummary.securitySamples}，策略拒绝 ${w.auditSummary.policySamples}，运行异常 ${w.auditSummary.operationSamples}`" type="info" :closable="false" />
          <div class="at-ingest-grid">
            <PanelCard title="轨迹文件接入与解析" icon="Upload"
              ><template #extra
                ><div class="at-file-actions">
                  <el-button
                    :disabled="working"
                    @click="openBatch"
                    >新建批次</el-button
                  >
                  <label
                    class="at-upload"
                    :class="{
                      disabled: working || !w.batch || !w.batch.allowedActions.includes('upload'),
                    }"
                    ><input
                      type="file"
                      accept=".json,.jsonl"
                      multiple
                      :disabled="working || !w.batch || !w.batch.allowedActions.includes('upload')"
                      @change="filesChanged"
                    /><AppIcon name="Upload" /><span>选择文件</span></label
                  ><el-select v-model="defaultFormat" aria-label="新文件默认格式"
                    ><el-option label="自动识别格式" value="auto" /><el-option
                      v-for="f in w.formats"
                      :key="f.code"
                      :label="f.label"
                      :value="f.code" /></el-select
                  ><el-button
                    type="primary"
                    :disabled="
                      working ||
                      !w.batch?.allowedActions.includes('parse') ||
                      !w.files.items.some((f) => f.parseStatus !== 'succeeded')
                    "
                    @click="parse()"
                    ><AppIcon name="CaretRight" /><span>开始解析</span></el-button
                  >
                </div></template
              >
              <el-alert
                v-if="w.batch?.stagingChanged"
                title="有待解析变更，以下批次统计仍为上次完成快照"
                type="info"
                :closable="false"
              />
              <div v-for="f in w.files.items" :key="f.fileId" class="at-file">
                <AppIcon name="Document" /><strong>{{ f.filename }}</strong>
                <div class="at-recognition">
                  <span class="at-recognition-label">识别结果：</span
                  ><el-select
                    :model-value="f.formatOverride"
                    :disabled="working || !w.batch?.allowedActions.includes('bind_files')"
                    aria-label="文件格式覆盖"
                    @change="override(f.fileId, $event)"
                    ><el-option
                      value="auto"
                      :label="
                        f.detectedFormat
                          ? w.formats.find((x) => x.code === f.detectedFormat)?.label
                          : '自动识别'
                      " /><el-option
                      v-for="format in w.formats"
                      :key="format.code"
                      :value="format.code"
                      :label="format.label"
                  /></el-select>
                </div>
                <span
                  class="at-parse-status"
                  :class="f.parseStatus === 'succeeded' ? 'at-success' : 'at-warning'"
                  ><AppIcon
                    :name="f.parseStatus === 'succeeded' ? 'CircleCheckFilled' : 'WarningFilled'"
                  /><span
                    >{{ f.parsedTraceCount
                    }}{{ f.inputCandidateCount != null ? ` / ${f.inputCandidateCount}` : '' }}
                    {{ labels[f.parseStatus] || f.parseStatus }}</span
                  ></span
                >
                <p v-for="e in f.errorExamples" :key="e.lineStart" class="at-warning">
                  第 {{ e.lineStart }} 条：{{ e.message }}
                </p>
              </div>
              <el-pagination
                v-if="w.files.totalPages > 1"
                small
                layout="prev, pager, next"
                :total="w.files.total"
                :page-size="20"
                :current-page="w.files.page"
                @current-change="store.load({ ...store.query, filesPage: $event })"
              />
              <div v-for="(row, i) in queue" :key="i" class="at-file">
                <span>{{ row.file.name }} · {{ row.state }}</span
                ><span class="at-warning">{{ row.error }}</span
                ><el-button v-if="row.error" link @click="retryUpload(row)">重试上传</el-button
                ><el-button
                  v-if="!row.fileId && row.state !== '上传中'"
                  link
                  @click="queue.splice(i, 1)"
                  >移除</el-button
                >
              </div>
              <el-empty
                v-if="!w.files.total && !queue.length"
                description="选择 JSON / JSONL 运行日志，上传后开始解析"
                :image-size="60"
              /><el-button
                v-if="queue.some((r) => r.fileId)"
                :disabled="working"
                @click="uploadPending"
                >重试绑定已上传文件</el-button
              ><el-button
                v-if="w.files.items.some((f) => f.failedRecordCount)"
                :disabled="working"
                @click="parse('retry_failed')"
                >重试失败记录</el-button
              > </PanelCard
            ><PanelCard title="接入汇总" icon="DataAnalysis"
              ><p>
                批次：<strong>{{ traceBatchLabel(w.batch) }}</strong>
              </p>
              <p>
                文件 <b>{{ w.summary.fileCount }}</b> 个 | 已接入格式
                <b>{{ w.summary.importedFormatCount }}</b> 种 | 支持格式
                <b>{{ w.summary.supportedFormatCount }}</b> 种
              </p>
              <p>
                轨迹 <b>{{ w.summary.parsedTraceCount }}</b> 条 | 失败记录
                <b>{{ w.summary.failedRecordCount }}</b>
              </p>
              <p>
                <span v-for="l in w.summary.byLanguage" :key="l.code"
                  >{{ l.code === 'zh' ? '中文' : l.code === 'en' ? 'English' : '未知' }}
                  <b>{{ l.count }}</b>
                </span>
              </p>
              <h4>
                测试集类别（{{ w.summary.categoryMode === 'single' ? '单标签' : '多标签' }}，共
                {{ w.summary.parsedTraceCount }} 条）
              </h4>
              <div class="at-categories">
                <span v-for="c in w.summary.byCategory" :key="c.code"
                  >{{ c.label }} <b>{{ c.count }}</b></span
                >
              </div>
              <small>ⓘ 测试集标签，不代表检出风险。统计范围为整个批次快照。</small></PanelCard
            >
          </div>
        </template>
        <div class="at-context">
          <label
            >来源<el-select
              :model-value="store.query.sourceId || d?.sourceId"
              filterable
              remote
              :remote-method="store.options"
              aria-label="来源"
              @change="changeSource"
              ><el-option
                v-for="s in w.sourceOptions.items"
                :key="s.sourceId"
                :label="s.filename"
                :value="s.sourceId"
              /><template #footer
                ><el-button
                  v-if="w.sourceOptions.page > 1"
                  text
                  @click="store.options('', w.sourceOptions.page - 1)"
                  >上一页来源</el-button
                ><el-button
                  v-if="w.sourceOptions.page < w.sourceOptions.totalPages"
                  text
                  @click="store.options('', w.sourceOptions.page + 1)"
                  >下一页来源</el-button
                ></template
              ></el-select
            ></label
          ><label
            >当前批次<el-select
              :model-value="store.query.batchId"
              aria-label="当前批次"
              @change="changeBatch"
              ><el-option
                v-for="b in w.batchOptions.items"
                :key="b.batchId"
                :label="traceBatchLabel(b)"
                :value="b.batchId"
              /><template #footer
                ><el-button
                  v-if="w.batchOptions.page > 1"
                  text
                  @click="store.options('', 1, w.batchOptions.page - 1)"
                  >上一页批次</el-button
                ><el-button
                  v-if="w.batchOptions.page < w.batchOptions.totalPages"
                  text
                  @click="store.options('', 1, w.batchOptions.page + 1)"
                  >下一页批次</el-button
                ></template
              ></el-select
            ></label
          ><label
            >当前样本<el-select
              :model-value="store.query.traceId"
              aria-label="当前样本"
              @change="choose"
              ><el-option
                v-if="d && !w.samplePage.items.some((s) => s.traceId === d?.traceId)"
                :value="d.traceId"
                :label="`${d.displayId} (${d.language})`" /><el-option
                v-for="s in w.samplePage.items"
                :key="s.traceId"
                :label="`${s.displayId} (${s.language})`"
                :value="s.traceId" /></el-select></label
          ><el-button
            :disabled="!d?.navigation.previous || store.detailLoading"
            @click="choose(d!.navigation.previous!.traceId)"
            >← 上一样本</el-button
          ><el-button
            :disabled="!d?.navigation.next || store.detailLoading"
            @click="choose(d!.navigation.next!.traceId)"
            >下一样本 →</el-button
          >
        </div>
        <div v-if="view !== 'ingest' || store.query.issueType" class="at-list-controls">
          <template v-if="view !== 'ingest'">
            <el-input
              v-model="search"
              placeholder="检索样本编号"
              aria-label="检索样本编号"
              clearable
              @keyup.enter="store.samples(1, search)"
            /><el-button @click="store.samples(1, search)">查询</el-button
            ><el-pagination
              small
              layout="prev, pager, next"
              :total="w.samplePage.total"
              :page-size="w.samplePage.pageSize"
              :current-page="w.samplePage.page"
              @current-change="store.samples($event)"
            />
          </template>
          <el-tag
            v-if="store.query.issueType"
            closable
            @close="store.load({ batchId: store.query.batchId })"
            >{{ labels[store.query.issueType] }} · 批次问题集合</el-tag
          >
        </div>
        <el-alert
          v-if="store.detailError"
          :title="store.detailError"
          type="error"
          :closable="false"
        />
        <div v-if="store.detailLoading" role="status">正在读取样本与事件…</div>
        <div v-if="d" ref="preview" class="at-preview-grid">
          <PanelCard
            :title="
              view === 'ingest'
                ? `原始轨迹预览（${d.mapping.formatLabel}）`
                : view === 'tools'
                  ? '工具交互列表'
                  : '运行事件目录'
            "
            icon="Document"
            ><template #extra
              ><small v-if="view !== 'ingest'"
                >当前调用片段 · 完整轨迹 {{ d.eventCount }} 步</small
              ></template
            >
            <div v-if="view !== 'ingest'" class="at-event-select">
              <el-select
                :model-value="d.selectedEventId"
                aria-label="当前预览事件"
                @change="
                  store.select(d.traceId, $event, store.query.eventPage, store.query.eventTypes)
                "
                ><el-option
                  v-for="e in d.events.items"
                  :key="e.eventId"
                  :label="`${e.eventId} · ${e.label}`"
                  :value="e.eventId" /></el-select
              ><el-button link @click="copy(d.rawPreview.rawText)">复制原文</el-button>
            </div>
            <pre
              v-if="view === 'ingest'"
              class="at-code at-structured-json"
            ><code><span v-for="(line,i) in rawPreviewLines" :key="i"><i>{{ i + 1 }}</i><span class="at-json-line"><span v-for="(token, ti) in sourceTokens(line)" :key="ti" :class="token.kind ? `at-json-${token.kind}` : undefined">{{ token.text }}</span></span></span></code></pre>
            <small v-if="view === 'ingest'">按 JSON 层级缩进展示，行号为预览行号；原始文件内容不变。</small>
            <el-table
              v-else
              :data="d.events.items"
              highlight-current-row
              @row-click="
                store.select(
                  d.traceId,
                  $event.eventId,
                  store.query.eventPage,
                  store.query.eventTypes,
                )
              "
              ><el-table-column prop="eventId" label="事件" width="110" /><el-table-column
                prop="eventType"
                label="类型" /><el-table-column prop="label" label="内容" /><el-table-column
                prop="callId"
                label="调用标识"
            /></el-table>
            <small v-if="d.rawPreview.truncated" class="at-warning"
              >片段已截断，不能作为完整 JSON 使用。</small
            ><el-pagination
              v-if="d.events.totalPages > 1"
              small
              layout="prev, pager, next"
              :total="d.events.total"
              :page-size="50"
              :current-page="d.events.page"
              @current-change="store.select(d.traceId, undefined, $event, store.query.eventTypes)"
            /> </PanelCard
          ><PanelCard title="标准化结果预览" icon="Files"
            ><div v-if="view === 'ingest'" class="at-preview-event-controls">
              <label for="at-preview-event">当前事件</label>
              <el-select
                id="at-preview-event"
                :model-value="d.selectedEventId"
                aria-label="当前预览事件"
                filterable
                @change="selectPreviewEvent"
              >
                <el-option
                  v-for="(e, i) in previewEvents"
                  :key="e.eventId"
                  :value="e.eventId"
                  :label="`第 ${i + 1} / ${previewEvents.length} 个事件 · ${eventTypeLabels[e.eventType] || e.label || e.eventType}${e.toolName ? ` · ${e.toolName}` : ''}`"
                />
              </el-select>
              <el-button :disabled="previewEventIndex <= 0" @click="movePreviewEvent(-1)">← 上一事件</el-button>
              <el-button :disabled="previewEventIndex < 0 || previewEventIndex >= previewEvents.length - 1" @click="movePreviewEvent(1)">下一事件 →</el-button>
              <small>预览当前选中的一步；切换事件可查看该样本的其他记录。</small>
            </div><div class="at-normalized-fields">
              <div v-for="field in normalizedFields" :key="field.label" class="at-normalized-field" :class="{ 'at-normalized-field--wide': field.wide }">
                <span>{{ field.label }}</span>
                <code :title="field.title || field.value">{{ field.value }}</code>
                <el-button v-if="field.copyValue" link :aria-label="`复制 ${field.label}`" :title="`复制完整 ${field.label}`" @click="copy(field.copyValue)"><AppIcon name="CopyDocument" /></el-button>
              </div>
            </div>
            <div class="at-mapping-title">
              <strong
                ><AppIcon v-if="view === 'ingest'" name="Files" /><template v-else>▱ </template
                >当前来源字段映射 · {{ d.mapping.formatLabel }}</strong
              ><small>默认仅展示当前来源</small>
            </div>
            <el-table :data="d.mapping.rows" size="small" border
              ><el-table-column prop="sourcePath" label="原始字段" /><el-table-column
                prop="targetPath"
                label="标准字段" /><el-table-column prop="description" label="说明"
            /></el-table>

            <small
              >ⓘ 时间与 Token 来自源日志；未提供时显示“未提供”。执行路径仅展示已记录事件。</small
            ></PanelCard
          >
        </div>
        <el-empty
          v-else-if="!store.detailLoading && !store.detailError"
          description="当前范围没有可预览的轨迹，请上传并解析文件"
        />
        <div class="at-bottom">
          <PanelCard title="校验结果" icon="Checked"
            ><template #extra
              ><small>口径：轨迹样本（{{ w.validation.traceTotal }} 条）</small></template
            >
            <div class="at-metrics">
              <div v-for="m in w.validation.metrics" :key="m.code">
                <span
                  ><AppIcon
                    v-if="view === 'ingest'"
                    :name="
                      (
                        {
                          structure: 'Document',
                          call_link: 'Link',
                          time: 'Clock',
                          usage: 'DataAnalysis',
                        } as Record<string, string>
                      )[m.code]
                    "
                  />{{ labels[m.code] }}</span
                ><strong :class="m.state === 'verified' ? 'at-success' : 'at-warning'"
                  >{{ m.eligible ? m.passed : '—'
                  }}<small> / {{ m.eligible || '不适用' }}</small></strong
                ><AppIcon
                  v-if="view === 'ingest'"
                  class="at-metric-state"
                  :class="m.state === 'verified' ? 'is-complete' : 'is-missing'"
                  :name="m.state === 'verified' ? 'CircleCheck' : 'Warning'"
                /><small v-if="m.notApplicable">不适用 {{ m.notApplicable }} 条</small>
              </div>
            </div>
            <small>ⓘ 可选字段缺失不阻断分析；缺少时间或用量的样本不计入对应指标。</small>
            <p>
              <b>来源格式保留：</b
              >{{
                w.summary.byFormat
                  .filter((f) => f.traceCount)
                  .map((f) => w!.formats.find((x) => x.code === f.code)?.label)
                  .join('、') || '尚未接入'
              }}
            </p>
            <p>
              <b>缺失位置：</b
              ><span v-for="i in w.issues" :key="i.code"
                >{{ labels[i.code] }} {{ i.affectedTraceCount }} 条
              </span>
            </p>
            <p>
              <b>样本映射：</b>{{ w.summary.fileCount }} 个文件 ·
              {{ w.summary.parsedTraceCount }} 条轨迹样本 · 解析失败记录
              {{ w.summary.failedRecordCount }}
            </p></PanelCard
          ><PanelCard title="问题与后续操作" icon="Warning"
            ><template #extra
              ><small>{{
                w.validation.canContinue ? '仅提示，不影响继续分析' : '请先解决阻塞问题'
              }}</small></template
            >
            <div v-for="i in w.issues" :key="i.code" class="at-issue">
              <el-tag type="warning" size="small">提示</el-tag
              ><strong>{{ labels[i.code] || i.code }} {{ i.affectedTraceCount }} 条</strong
              ><small
                >{{ i.impact }} · 示例 {{ i.examples.map((e) => e.displayId).join('、') }}</small
              ><el-button link type="primary" @click="locate(i.code)">定位样本 →</el-button>
            </div>
            <p v-if="!w.issues.length">
              {{
                w.validation.canContinue
                  ? '未发现影响当前分析的数据缺口'
                  : w.validation.blockers.join('；')
              }}
            </p>
            <small
              >{{ w.validation.canContinue ? '✓ 当前批次可继续分析' : '尚不可分析' }} | 解析失败记录
              {{ w.summary.failedRecordCount }} | 未导入格式不计入校验</small
            >
            <div class="at-next">
              <el-button
                v-for="v in views.slice(1)"
                :key="v.code"
                :disabled="!w.validation.canContinue"
                @click="setView(v.code)"
                >查看{{ v.code === 'execution' ? '执行路径' : v.label }} →</el-button
              >
            </div></PanelCard
          >
        </div>
      </template>
    </template>
    <el-dialog :model-value="!!example" title="格式示例" width="720px" @close="example = null"
      ><template v-if="example"
        ><p>{{ example.label }} · Schema {{ example.schemaVersion }}</p>
        <pre class="at-code">{{ example.exampleText }}</pre>
        <el-button @click="copy(example.exampleText)">复制样例</el-button
        ><el-button @click="saveText(example.exampleText, example.code + '.json')"
          >下载样例</el-button
        ></template
      ></el-dialog
    >
    <el-dialog v-model="batchDialog" title="新建轨迹批次" width="440px"
      ><el-input
        v-model="batchName"
        maxlength="100"
        aria-label="批次名称"
        placeholder="输入批次名称"
      /><template #footer
        ><el-button @click="batchDialog = false">取消</el-button
        ><el-button type="primary" :disabled="!batchName.trim() || working" @click="createBatch"
          >创建</el-button
        ></template
      ></el-dialog
    >
    <el-dialog
      v-model="exportDialog"
      title="导出结果包"
      width="640px"
      align-center
      append-to-body
      class="trace-package-dialog"
      ><h3 class="trace-package-section">轨迹接入与校验 · 导出范围</h3>
      <p>批次 {{ traceBatchLabel(w?.batch) }} · 当前快照 {{ store.query.snapshotId }}</p>
      <el-select v-model="exportScope" aria-label="导出范围"
        ><el-option value="batch" label="整个批次（忽略来源过滤）" /><el-option
          value="filtered"
          label="当前来源与问题筛选" /><el-option
          value="sample"
          label="当前样本"
          :disabled="!d" /></el-select
      ><el-checkbox-group v-model="contents" class="at-export-options"
        ><el-checkbox
          v-for="c in w?.exportOptions.contents || []"
          :key="c.code"
          :value="c.code"
          :disabled="c.code === 'manifest' || c.availability === 'unavailable'"
          >{{ labels[c.code] || c.code }}
          {{ c.availability === 'unavailable' ? c.reason : '' }}</el-checkbox
        ></el-checkbox-group
      >
      <p>✓ 敏感字段脱敏 ✓ 样本编号匿名化（默认启用）</p>
      <small>尚未提供的图表不进入结果包；图片、HTML、JSON 和索引使用一致规则。</small
      ><template #footer
        ><el-button @click="exportDialog = false">取消</el-button
        ><el-button type="primary" :disabled="working" @click="exportResult('package')"
          >生成并下载 ZIP</el-button
        ></template
      ></el-dialog
    >
  </div>
</template>
<style scoped src="./agent-traces.css"></style>
