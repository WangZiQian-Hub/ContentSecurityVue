<script setup lang="ts">
import ViewExportStatus from './ViewExportStatus.vue'
import RuleFindings from './RuleFindings.vue'
import { traceBatchLabel } from '../../../../utils/agent-trace-presentation'
import { computed, ref, watch, onUnmounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import ExecutionGraph from './ExecutionGraph.vue'
import ExecutionGlyph from './ExecutionGlyph.vue'
import AppIcon from '../../../../components/AppIcon.vue'
import { useRoute, useRouter } from 'vue-router'
import { useComplianceStore } from '../../../../stores/compliance'
import { useExecutionStore } from '../../../../stores/agent-trace-execution'
import { useExecutionExport } from '../../../../composables/useExecutionExport'
import { executionEvidenceHttp } from '../../../../api/agent-trace-execution'
import { traceZip } from '../../../../utils/agent-trace-export'
import { executionSamples } from '../../../../mock/agent-trace-execution'
import type { ExecutionEvent, ExecutionEvidenceContext, ExecutionText } from '../../../../types/agent-trace-execution'
const exportState = useExecutionExport()
const {
  busy: exporting,
  error: exportError,
  task: exportTask,
  downloading: exportDownloading,
} = exportState
const store = useExecutionStore(),
  parent = useComplianceStore(),
  route = useRoute(),
  router = useRouter(),
  search = ref(''),
  filter = ref(false),
  language = ref('all'),
  risk = ref('all'),
  audit = ref('all'),
  packageDialog = ref(false),
  packageScope = ref('batch'),
  evidenceIndex = ref(0)
const d = computed(() => store.detail),
  s = computed(() => store.selection),
  evidence = computed(() => s.value?.riskEvidence.items[evidenceIndex.value]),
  w = computed(() => store.workspace)
const graph = ref<InstanceType<typeof ExecutionGraph>>()
const sampleScroll = ref<HTMLDivElement | null>(null)
const highlightedEvent = ref('')
const originalEvidenceOpen = ref(false)
const originalEvidenceLoading = ref(false)
const originalEvidenceError = ref('')
const originalEvidence = ref<ExecutionEvidenceContext | null>(null)
const originalEvidenceEvent = ref('')
let originalEvidenceController: AbortController | undefined
const showEventTime = computed(() => d.value?.hasEventTime ??
  !!d.value?.events.items.some(event => typeof event.relativeTimeMs === 'number' && Number.isFinite(event.relativeTimeMs)))
const reasoningOriginal = computed(() => {
  const original = s.value?.content.reasoningOriginal
  return original?.text.trim() && original.provenance === 'source_log' ? original : undefined
})
watch(() => d.value?.traceId, () => { highlightedEvent.value = '' })
async function locateEvent(id: string) {
  highlightedEvent.value = ''
  if (!await store.locate(id)) return
  highlightedEvent.value = id
  await nextTick()
  await graph.value?.focusEvent(id)
}
function scrollEventRow(id: string, scrollPage = false) {
  const row = document.getElementById(`execution-log-${id}`)
  const container = row?.closest('.ex-table')
  if (!(row instanceof HTMLTableRowElement) || !(container instanceof HTMLElement)) return
  container.scrollTop += row.getBoundingClientRect().top - container.getBoundingClientRect().top -
    (container.clientHeight - row.clientHeight) / 2
  if (scrollPage) row.closest('.ex-log')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
async function selectFirstRisk(scrollPage = true) {
  const detail = d.value
  const id = detail?.firstRiskEventId
  if (!id) return
  store.pause()
  if (s.value?.eventId !== id || !detail.events.items.some(event => event.eventId === id))
    await store.select(id, true)
  if (d.value?.traceId !== detail.traceId || d.value.scope.snapshotId !== detail.scope.snapshotId || s.value?.eventId !== id) return
  await nextTick()
  scrollEventRow(id, scrollPage)
}
async function openOriginalEvidence(event: ExecutionEvent) {
  const detail = d.value
  if (!detail) return
  store.pause()
  void store.select(event.eventId)
  originalEvidenceController?.abort()
  const controller = new AbortController()
  originalEvidenceController = controller
  originalEvidenceEvent.value = event.displayId
  originalEvidence.value = null
  originalEvidenceError.value = ''
  originalEvidenceLoading.value = true
  originalEvidenceOpen.value = true
  try {
    const result = await executionEvidenceHttp(detail.scope.batchId, detail.traceId, {
      ...detail.scope,
      eventId: event.eventId,
      redactionMode: store.raw ? 'raw' : 'redacted',
    }, controller.signal)
    if (controller.signal.aborted) return
    if (result.scope.batchId !== detail.scope.batchId ||
        result.scope.snapshotId !== detail.scope.snapshotId ||
        result.scope.projectionVersion !== detail.scope.projectionVersion ||
        result.traceId !== detail.traceId || result.eventId !== event.eventId ||
        !result.complete || typeof result.originalText !== 'string' ||
        typeof result.beforeText !== 'string' || typeof result.afterText !== 'string')
      throw Error('原文证据不完整')
    originalEvidence.value = result
  } catch {
    if (!controller.signal.aborted) originalEvidenceError.value = '暂时无法获取完整原文及前后文，请稍后重试。'
  } finally {
    if (!controller.signal.aborted) originalEvidenceLoading.value = false
  }
}
function closeOriginalEvidence() {
  originalEvidenceController?.abort()
  originalEvidenceLoading.value = false
}
async function copySnippet(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制全文')
  } catch {
    ElMessage.error('复制失败，请在弹窗中选择全文复制')
  }
}
const eventDescription = (text: unknown) => typeof text === 'string' && text.trim() ? text : ''
const eventHasRisk = (event: ExecutionEvent) =>
  event.hasRisk ?? ['high', 'medium', 'low'].includes(event.riskLevel)
const eventEvidenceSummary = (event: ExecutionEvent) =>
  event.evidenceSummary ||
  event.selectionPreview.riskEvidence.items[0]?.matchPattern ||
  (event.selectionPreview.lineage.nodes.length
    ? '来源：' + event.selectionPreview.lineage.nodes[0]?.id
    : '—')
const duration = (n: number | null) => (n === null ? '未提供' : `${(n / 1000).toFixed(1)} s`)
const relativeTime = (n: number | null) =>
  n === null
    ? '未提供'
    : `${String(Math.floor(n / 60000)).padStart(2, '0')}:${String(Math.floor(n / 1000) % 60).padStart(2, '0')}.${String(n % 1000).padStart(3, '0')}`
const level = (v: string) =>
  ({ high: '高风险', medium: '中风险', low: '低风险', none: '无风险', unknown: '待审计' })[v] || v
let debounce: ReturnType<typeof setTimeout> | undefined
let navigationVersion = 0
watch(
  () => parent.demo,
  async (mode) => {
    const version = ++navigationVersion
    const target = typeof route.query.locateEventId === 'string' ? route.query.locateEventId : undefined
    exportState.reset()
    packageDialog.value = false
    await store.configure(
      mode,
      typeof route.query.batchId === 'string' ? route.query.batchId : undefined,
      typeof route.query.traceId === 'string' ? route.query.traceId : undefined,
      typeof route.query.eventId === 'string' ? route.query.eventId : undefined,
      typeof route.query.snapshotId === 'string' ? route.query.snapshotId : undefined,
    )
    if (version === navigationVersion && target && s.value?.eventId === target) await locateEvent(target)
  },
  { immediate: true },
)
watch(
  () => [
    w.value?.scope?.batchId,
    w.value?.scope?.snapshotId,
    d.value?.traceId,
    s.value?.eventId,
    store.loading,
  ],
  () => {
    if (route.query.view !== 'execution' || !w.value?.scope || !d.value || store.loading) return
    void router.replace({
      query: {
        view: 'execution',
        batchId: w.value.scope.batchId,
        snapshotId: w.value.scope.snapshotId,
        traceId: d.value.traceId,
        eventId: s.value?.eventId,
      },
    })
  },
)
watch(search, () => {
  clearTimeout(debounce)
  debounce = setTimeout(() => void store.search(1, { q: search.value }), 300)
})
watch(
  () => d.value ? `${d.value.scope.batchId}\u0000${d.value.scope.snapshotId}\u0000${d.value.traceId}` : '',
  (key) => {
    if (key && !route.query.locateEventId) void selectFirstRisk(false)
  },
  { flush: 'post' },
)
watch(
  () => s.value?.eventId,
  async () => {
    evidenceIndex.value = 0
    await nextTick()
    if (s.value?.eventId) scrollEventRow(s.value.eventId)
  },
)
onUnmounted(() => {
  closeOriginalEvidence()
  navigationVersion++
  exportState.reset()
  clearTimeout(debounce)
  store.dispose()
})
function tokens(content?: ExecutionText) {
  if (!content) return [{ text: '未提供', mark: false }]
  const ranges = [...content.highlights]
    .filter((r) => r.start >= 0 && r.end <= content.text.length && r.end > r.start)
    .sort((a, b) => a.start - b.start)
  let start = 0
  const out: { text: string; mark: boolean }[] = []
  for (const r of ranges) {
    if (r.start < start) continue
    out.push(
      { text: content.text.slice(start, r.start), mark: false },
      { text: content.text.slice(r.start, r.end), mark: true },
    )
    start = r.end
  }
  out.push({ text: content.text.slice(start), mark: false })
  return out
}
async function run() {
  search.value = ''
  await store.run(
    route.query.batchId === store.draftBatchId && typeof route.query.traceId === 'string'
      ? route.query.traceId
      : undefined,
    route.query.batchId === store.draftBatchId && typeof route.query.eventId === 'string'
      ? route.query.eventId
      : undefined,
    route.query.batchId === store.draftBatchId && typeof route.query.snapshotId === 'string'
      ? route.query.snapshotId
      : undefined,
  )
}
function applyFilters() {
  filter.value = false
  void store.search(1, {
    language: language.value,
    riskLevel: risk.value,
    auditDecision: audit.value,
  })
}
function toggleFilter() {
  filter.value = !filter.value
  if (filter.value && sampleScroll.value) sampleScroll.value.scrollTop = 0
}
async function exportResult(kind: 'view' | 'package') {
  if (!store.canExport || !d.value || !w.value?.scope || exporting.value || exportDownloading.value)
    return
  store.pause()
  const detail = d.value,
    scope = { ...w.value.scope },
    filters = { ...store.query },
    selectedEvent = s.value?.eventId,
    scopeType = kind === 'view' ? 'sample' : packageScope.value
  const input = {
    ...scope,
    view: 'execution',
    exportKind: kind,
    format: kind === 'view' ? 'json' : 'zip',
    selectedTraceId: detail.traceId,
    selectedEventId: selectedEvent,
    scope: {
      type: scopeType,
      traceIds: scopeType === 'sample' ? [detail.traceId] : [],
      ...filters,
    },
    uiState: {
      eventPage: detail.events.page,
      page: w.value.samplePage.page,
      graphEventIds: detail.graph.nodes.map((n) => n.eventId),
      redactionMode: store.raw ? 'raw' : 'redacted',
    },
    contents:
      kind === 'view' ? ['normalized_json'] : ['normalized_json', 'evidence_index', 'manifest'],
    redactionProfile: store.raw ? 'none' : 'standard',
    anonymizeIds: true,
    timezone: 'Asia/Shanghai',
    locale: 'zh-CN',
    uiVersion: 'agent-trace-execution-v1',
  }
  await exportState.start(input, parent.demo, async () => {
    if (kind === 'view')
      return new Blob([JSON.stringify(detail, null, 2)], { type: 'application/json' })
    const rows =
      scopeType === 'sample'
        ? [detail.summary]
        : executionSamples.filter(
            (x) =>
              scopeType !== 'filtered' ||
              ((!filters.q || x.displayId.includes(filters.q)) &&
                (!filters.language ||
                  filters.language === 'all' ||
                  x.language === filters.language) &&
                (!filters.riskLevel ||
                  filters.riskLevel === 'all' ||
                  x.riskLevel === filters.riskLevel) &&
                (!filters.auditDecision ||
                  filters.auditDecision === 'all' ||
                  x.auditDecision === filters.auditDecision)),
          )
    return traceZip([
      {
        name: 'manifest.json',
        text: JSON.stringify(
          {
            scope: input.scope,
            contextScope: scope,
            sampleCount: rows.length,
            redactionProfile: input.redactionProfile,
          },
          null,
          2,
        ),
      },
      { name: 'samples.json', text: JSON.stringify(rows, null, 2) },
      { name: 'evidence-index.json', text: JSON.stringify(detail.dangerPatterns.items, null, 2) },
    ])
  })
  if (!exportError.value) packageDialog.value = false
}

defineExpose({
  reportScope: computed(() => w.value?.scope ? { batchId: w.value.scope.batchId, snapshotId: w.value.scope.snapshotId } : null),
  canView: computed(() => store.canExport && !exporting.value && !exportDownloading.value),
  canPackage: computed(() => store.canExport && !exporting.value && !exportDownloading.value),
  exportView: () => exportResult('view'),
  openPackage: () => {
    return exportResult('package')
  },
})
</script>
<template>
  <section class="execution-view">
    <ViewExportStatus
      v-if="exportTask || exportError"
      :task="exportTask"
      :error="exportError"
      :download="exportState.download"
    />
    <div class="ex-query">
      <label>批次</label
      ><el-select
        v-model="store.draftBatchId"
        filterable
        :disabled="store.loading"
        @change="
          store.dirty = true; store.pause()
        "
        ><el-option
          v-for="b in store.options"
          :key="b.batchId"
          :value="b.batchId"
          :label="traceBatchLabel(b)" /></el-select
      ><el-button
        type="primary"
        :loading="store.loading"
        :disabled="!store.draftBatchId"
        @click="run"
        >查询</el-button
      >
      <div v-if="w?.scope" class="ex-result">
        当前结果：批次 {{ traceBatchLabel(store.options.find((b) => b.batchId === w?.scope?.batchId)) }} ·
        样本规模 {{ w.batchSummary.sampleCount }}（{{
          w.batchSummary.byLanguage
            .map(
              (l) =>
                `${l.code === 'zh' ? '中文' : l.code === 'en' ? 'English' : l.code} ${l.count}`,
            )
            .join(' / ')
        }}）· 查询时间 {{ new Date(w.queriedAt).toLocaleString('zh-CN') }}<br /><template v-if="d"
          >当前样本：{{ d.summary.displayId }}（{{
            d.summary.language === 'en'
              ? 'EN'
              : d.summary.language === 'zh'
                ? '中文'
                : d.summary.language
          }}）· 风险类型： {{ d.summary.riskTypes.map((r) => r.label).join(' / ') }} ·
          {{ level(d.summary.riskLevel) }} · 步骤 {{ d.summary.eventCount }} steps · 工具调用
          {{ d.summary.callCount }} calls · 耗时 {{ duration(d.summary.durationMs) }}</template
        >
      </div>
      <section v-if="w?.scope" class="ex-tool-summary" aria-label="批次工具调用统计">
        <div class="ex-tool-summary-total"><span>工具调用总次数</span><div><strong>{{ w.toolCallSummary?.totalCallCount?.toLocaleString('zh-CN') ?? '未提供' }}</strong><small>次</small></div></div>
        <div class="ex-tool-counts">
          <article v-for="tool in w.toolCallSummary?.items || []" :key="tool.toolName">
            <span>{{ tool.toolName }}</span><div><b>{{ tool.callCount.toLocaleString('zh-CN') }}</b><small>次</small></div>
          </article>
          <span v-if="w.toolCallSummary?.totalCallCount === 0">本批次暂无工具调用</span>
        </div>
      </section>
    </div>
    <el-alert
      v-if="store.dirty && w"
      title="查询条件已变更，请点击查询"
      type="warning"
      :closable="false"
    />
    <el-alert v-if="store.error" :title="store.error" type="error" :closable="false" />
    <el-empty
      v-if="!w"
      :description="
        store.loading
          ? '正在加载默认批次结果'
          : store.error
            ? '结果加载失败，请点击查询重试'
            : '暂无可查询批次'
      "
    />
    <el-alert v-if="w?.activeSnapshotId && w.scope && w.activeSnapshotId !== w.scope.snapshotId" title="当前为历史快照，后台已有新的审计结果。" type="info" :closable="false"><el-button link @click="store.run(d?.traceId)">查看最新结果</el-button></el-alert>
    <RuleFindings v-if="d" :items="d.ruleFindings" :version="d.ruleAudit?.version" @locate="locateEvent" />
    <div v-if="w" v-loading="store.loading" class="ex-columns">
      <aside class="ex-card ex-sample-panel">
        <h3 :title="`当前页 ${w.samplePage.items.length} 条，筛选命中 ${w.samplePage.total} 条`">
          样本检索与列表（{{ w.samplePage.total }}）
        </h3>
        <div class="ex-search">
          <el-input v-model="search" placeholder="搜索样本ID、风险类型或关键词" /><el-button
            aria-label="筛选"
            :aria-expanded="filter"
            @click="toggleFilter"
            ><AppIcon name="Filter"
          /></el-button>
        </div>
        <div ref="sampleScroll" class="ex-sample-scroll">
          <div v-if="filter">
            <el-select v-model="language"
              ><el-option
                v-for="v in ['all', 'zh', 'en', 'other', 'unknown']"
                :key="v"
                :value="v"
                :label="v === 'all' ? '全部语种' : v" /></el-select
            ><el-select v-model="risk"
              ><el-option
                v-for="v in ['all', 'high', 'medium', 'low', 'none', 'unknown']"
                :key="v"
                :value="v"
                :label="v === 'all' ? '全部风险' : level(v)" /></el-select
            ><el-select v-model="audit"
              ><el-option
                v-for="v in ['all', 'risk_found', 'no_risk_found', 'pending', 'error', 'unknown']"
                :key="v"
                :value="v"
                :label="v" /></el-select
            ><el-button @click="applyFilters">应用筛选</el-button>
          </div>
          <button
            v-for="sample in w.samplePage.items"
            :key="sample.traceId"
            class="ex-sample"
            :class="{ selected: d?.traceId === sample.traceId }"
            :aria-pressed="d?.traceId === sample.traceId"
            @click="store.choose(sample.traceId)"
          >
            <b>{{ sample.displayId }}</b>
            <el-tag size="small" :type="sample.language === 'zh' ? 'warning' : 'primary'">{{
              sample.language === 'en' ? 'EN' : sample.language === 'zh' ? '中文' : sample.language
            }}</el-tag
            ><span :class="sample.riskLevel">{{ level(sample.riskLevel) }}</span
            ><small
              >{{ sample.riskTypes.map((r) => r.label).join(' / ') || '暂无风险类别' }} /
              {{ sample.eventCount }} steps / {{ sample.callCount }} calls /
              {{ duration(sample.durationMs) }}</small
            >
          </button>
        </div>
        <footer class="ex-sample-footer" aria-label="样本列表分页">
          <el-pagination
            small
            layout="prev, pager, next"
            :pager-count="5"
            :total="w.samplePage.total"
            :page-size="w.samplePage.pageSize"
            :current-page="w.samplePage.page"
            @current-change="store.search($event)"
          />
        </footer>
      </aside>
      <main v-loading="store.detailLoading">
        <el-alert v-if="store.detailError" :title="store.detailError" type="error" /><el-button
          v-if="store.detailError"
          @click="w?.selectedTraceId && store.choose(w.selectedTraceId)"
          >重试详情</el-button
        >
        <template v-if="d"
          ><section class="ex-card ex-path-panel">
            <h3>
              思维轨迹
              <small
                >（{{ d.graph.nodes.length === d.graph.totalNodes ? '完整' : '已加载' }}
                {{ d.graph.totalNodes }} 个节点，已解析 {{ d.graph.nodes.length }} /
                {{ d.graph.totalNodes }}）</small
              >
            </h3>
            <ExecutionGraph
              ref="graph"
              :graph="d.graph"
              :selected="s?.eventId"
              :highlighted="highlightedEvent"
              @select="
                highlightedEvent = ''; store.pause(); store.select($event)
              "
            /><el-button v-if="d.graph.nextCursor" @click="store.moreGraph">加载更多节点</el-button>
          </section>
          <section class="ex-card">
            <h3>
              来源溯源链
              <el-tag v-if="s?.lineage.nodes.length" size="small" type="success">可观察关联</el-tag>
            </h3>
            <div class="ex-chain">
              <button
                v-for="n in s?.lineage.nodes"
                :key="n.id"
                @click="n.eventId && store.select(n.eventId)"
              >
                <ExecutionGlyph :label="n.label" /><span
                  ><b>{{ n.id.startsWith('mock_') ? s?.displayId : n.id }}</b
                  ><br />{{ n.label }}</span
                ></button
              ><span v-if="!s?.lineage.nodes.length">暂无关联来源</span>
            </div>
          </section>
          <section class="ex-card">
            <div class="ex-toolbar">
              <h3>关键内容与推理</h3>
              <el-radio-group :model-value="store.raw" @change="store.toggleRaw(Boolean($event))"
                ><el-radio-button :value="true" :disabled="!d.permissions.canViewRaw"
                  >原文</el-radio-button
                ><el-radio-button :value="false">脱敏</el-radio-button></el-radio-group
              >
            </div>
            <div class="ex-content">
              <article>
                <b>原始来源内容</b>
                <p>
                  <template v-for="(t, i) in tokens(s?.content.sourceExcerpt)" :key="i"
                    ><mark v-if="t.mark">{{ t.text }}</mark
                    ><span v-else>{{ t.text }}</span></template
                  >
                </p>
              </article>
              <article>
                <b>已记录思考原文</b>
                <p>
                  <template v-if="reasoningOriginal"><template v-for="(t, i) in tokens(reasoningOriginal)" :key="i"
                    ><mark v-if="t.mark">{{ t.text }}</mark
                    ><span v-else>{{ t.text }}</span></template
                  ></template><span v-else>未提供思考原文</span>
                </p>
              </article>
            </div>
          </section></template
        >
        <el-empty v-else :description="store.detailLoading ? '正在读取样本' : '暂无样本详情'" />
      </main>
      <aside v-if="d">
        <section class="ex-card">
          <h3>
            风险证据信息 <small>（选中节点：{{ s?.displayId || '未选节点' }}）</small>
          </h3>
          <el-select v-if="(s?.riskEvidence.items.length || 0) > 1" v-model="evidenceIndex"
            ><el-option
              v-for="(e, i) in s?.riskEvidence.items"
              :key="e.evidenceId"
              :value="i"
              :label="e.matchPattern"
          /></el-select>
          <dl v-if="evidence">
            <dt>风险类别</dt>
            <dd>{{ evidence.riskType.label }}</dd>
            <dt>匹配模式</dt>
            <dd>{{ evidence.matchPattern }}</dd>
            <dt>风险严重性</dt>
            <dd :class="evidence.severity">{{ level(evidence.severity) }}</dd>
            <dt>规则命中</dt>
            <dd>
              <span :title="evidence.ruleId">规则命中</span> /
              <el-tag type="warning" size="small">{{
                evidence.reviewStatus === 'pending' ? '待人工确认' : evidence.reviewStatus
              }}</el-tag>
            </dd>
            <dt>置信度</dt>
            <dd>{{ evidence.confidence ?? '未提供' }}</dd>
            <dt>关联调用</dt>
            <dd>{{ evidence.relatedCallIds.join(' / ') }}</dd>
          </dl>
          <p v-else>
            {{
              d.summary.auditDecision === 'pending' ? '尚未完成审计' : '当前节点暂无已记录风险证据'
            }}
          </p>
        </section>
        <section class="ex-card">
          <h3>风险事件分布（本样本）</h3>
          <div v-for="r in d.riskDistribution.items" :key="r.code" class="ex-bar">
            <span>{{ r.label }} {{ r.eventCount }}次</span
            ><el-progress
              :show-text="false"
              :percentage="
                (r.eventCount / Math.max(5, ...d.riskDistribution.items.map((i) => i.eventCount))) *
                100
              "
            />
          </div>
          <small class="ex-distribution-note">各类别内按事件去重，类别之间可重叠</small>
        </section>
        <section class="ex-card ex-pattern-panel">
          <h3>
            危险模式列表 <small>（共 {{ d.dangerPatterns.total }} 项）</small>
          </h3>
          <div class="ex-pattern-heading">
            <span>序号</span><span>危险模式</span><span>关键片段/特征</span><span>定位</span>
          </div>
          <div class="ex-pattern-scroll">
            <button
              v-for="(p, pi) in d.dangerPatterns.items"
              :key="p.patternId"
              class="ex-pattern"
              @click="
                store.pause(); store.select(p.eventId)
              "
            >
              <span>{{ pi + 1 }}</span
              ><b>{{ p.label }}</b
              ><el-popover trigger="hover" placement="left" :width="420" :show-after="150">
                <template #reference><small tabindex="0" @click.stop>{{ p.snippet }}</small></template>
                <div class="ex-snippet-popup" @click.stop>
                  <div class="ex-snippet-toolbar"><b>关键片段/特征 · 全文</b><el-button size="small" type="primary" @click.stop="copySnippet(p.snippet)">复制全文</el-button></div>
                  <pre class="ex-snippet-full">{{ p.snippet }}</pre>
                </div>
              </el-popover><el-tag>{{ p.eventDisplayId }}</el-tag>
            </button>
          </div>
        </section>
      </aside>
    </div>
    <section v-if="d" class="ex-card ex-log" :class="{ 'ex-no-time': !showEventTime }">
      <div class="ex-toolbar">
        <h3>轨迹回放与事件日志（{{ d.events.total }} 个步骤）</h3>
        <div>
          <el-button
            :disabled="!s?.previousEventId || store.detailLoading"
            @click="
              store.pause(); store.step(-1)
            "
            >上一步</el-button
          ><el-button
            type="primary"
            :disabled="!s?.nextEventId || store.detailLoading"
            @click="store.play"
            >{{ store.playing ? '暂停' : '▶ 播放' }}</el-button
          ><el-button
            :disabled="!s?.nextEventId || store.detailLoading"
            @click="
              store.pause(); store.step(1)
            "
            >下一步</el-button
          ><el-button
            type="danger"
            plain
            :disabled="!d.firstRiskEventId"
            @click="selectFirstRisk()"
            >⚑ 首个风险</el-button
          >
        </div>
      </div>
      <small>仅回放已记录事件，不执行外部调用。时间缺失仍可按序查看。</small>
      <div class="ex-table">
        <table>
          <thead>
            <tr>
              <th>步骤</th>
              <th v-if="showEventTime">时间（相对）</th>
              <th>事件ID</th>
              <th>事件类型</th>
              <th>事件描述</th>
              <th>是否有风险</th>
              <th>原文证据</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="e in d.events.items"
              :id="`execution-log-${e.eventId}`"
              :key="e.eventId"
              :class="{ selected: s?.eventId === e.eventId }"
              tabindex="0"
              @click="
                store.pause();   store.select(e.eventId)
              "
              @keydown.enter="
                store.pause();   store.select(e.eventId)
              "
            >
              <td>{{ e.ordinal }}</td>
              <td v-if="showEventTime">{{ relativeTime(e.relativeTimeMs) }}</td>
              <td>{{ e.displayId }}</td>
              <td>{{ e.label }}</td>
              <td>
                <el-popover :key="e.eventId" trigger="hover" placement="top" :width="520" :show-after="150" :persistent="false">
                  <template #reference><span class="ex-event-description" tabindex="0">{{ eventDescription(e.description) }}</span></template>
                  <div @click.stop>
                    <div class="ex-snippet-toolbar"><b>事件描述 · {{ e.displayId }}</b><el-button size="small" type="primary" @click.stop="copySnippet(eventDescription(e.description))">复制全文</el-button></div>
                    <pre class="ex-snippet-full">{{ eventDescription(e.description) }}</pre>
                  </div>
                </el-popover>
              </td>
              <td>{{ eventHasRisk(e) ? '是' : '否' }}</td>
              <td>
                <div v-if="eventHasRisk(e)" class="ex-evidence-cell">
                  <el-popover v-if="eventEvidenceSummary(e) !== '—'" trigger="hover" placement="top" :width="520" :show-after="150" :persistent="false">
                    <template #reference><span class="ex-evidence-preview" tabindex="0">{{ eventEvidenceSummary(e) }}</span></template>
                    <div @click.stop>
                      <div class="ex-snippet-toolbar"><b>证据摘要 · {{ e.displayId }}</b><el-button size="small" type="primary" @click.stop="copySnippet(eventEvidenceSummary(e))">复制全文</el-button></div>
                      <pre class="ex-snippet-full">{{ eventEvidenceSummary(e) }}</pre>
                    </div>
                  </el-popover>
                  <span v-else class="ex-evidence-preview">—</span>
                  <el-button link type="primary" @click.stop="openOriginalEvidence(e)">查看原文</el-button>
                </div>
                <span v-else>无风险</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <el-pagination
        small
        layout="prev, pager, next"
        :total="d.events.total"
        :page-size="d.events.pageSize"
        :current-page="d.events.page"
        @current-change="store.eventPage($event)"
      />
    </section>
    <el-dialog
      v-model="originalEvidenceOpen"
      :title="`原文证据 · ${originalEvidenceEvent}`"
      width="min(760px, 92vw)"
      append-to-body
      @closed="closeOriginalEvidence"
    >
      <div v-loading="originalEvidenceLoading" class="ex-original-evidence">
        <p v-if="originalEvidenceError" role="alert">{{ originalEvidenceError }}</p>
        <template v-else-if="originalEvidence">
          <p v-if="originalEvidence.sourceRef">来源：{{ originalEvidence.sourceRef }}</p>
          <section><h4>前文</h4><pre>{{ originalEvidence.beforeText || '无' }}</pre></section>
          <section><h4>完整原文</h4><pre>{{ originalEvidence.originalText }}</pre></section>
          <section><h4>后文</h4><pre>{{ originalEvidence.afterText || '无' }}</pre></section>
        </template>
      </div>
    </el-dialog>
    <el-dialog
      v-model="packageDialog"
      title="导出结果包"
      width="640px"
      align-center
      append-to-body
      class="trace-package-dialog"
      ><h3 class="trace-package-section">思维轨迹 · 导出范围</h3>
      <p>已查询批次 {{ w?.scope?.batchId }}，固定快照 {{ w?.scope?.snapshotId }}</p>
      <el-select v-model="packageScope" aria-label="导出范围"
        ><el-option value="batch" label="整个批次（忽略局部筛选）" /><el-option
          value="filtered"
          label="筛选命中全部样本（不受分页限制）" /><el-option value="sample" label="当前样本"
      /></el-select>
      <h3 class="trace-package-section">结果包内容</h3>
      <div class="trace-package-files">
        <span>标准化数据</span><span>证据索引</span><span>manifest 清单</span>
      </div>
      <p>用于回溯当前范围内的思维步骤与证据关联；按当前授权脱敏策略生成。</p>
      <template #footer
        ><el-button :disabled="exporting" @click="packageDialog = false">取消</el-button
        ><el-button type="primary" :loading="exporting" @click="exportResult('package')"
          >生成并下载 ZIP</el-button
        ></template
      ></el-dialog
    >
  </section>
</template>
<style scoped>
.execution-view {
  color: #193a6b;
}
.ex-query,
.ex-card {
  background: #fff;
  border: 1px solid #dce9fb;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 10px;
}
.ex-query {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  align-items: center;
}
.ex-query label {
  font-size: 20px;
  font-weight: 700;
}
.ex-query .el-select {
  width: 280px;
}
.ex-result {
  background: #eaf4ff;
  padding: 10px;
  width: 100%;
  line-height: 1.8;
}
.ex-tool-summary { width: 100%; display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 14px; padding: 14px; border: 1px solid #dce9fb; border-radius: 10px; background: #f7faff; box-sizing: border-box; }
.ex-tool-summary-total { display: flex; flex-direction: column; justify-content: center; gap: 10px; padding: 16px; border-radius: 8px; background: #e7f0ff; font-size: 16px; font-weight: 700; }
.ex-tool-summary-total strong { font-size: 36px; color: #146df5; line-height: 1.2; }
.ex-tool-summary small { font-size: 13px; margin-left: 6px; }
.ex-tool-counts { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; align-content: center; min-width: 0; }
.ex-tool-counts > article { display: flex; flex-direction: column; justify-content: space-between; gap: 10px; min-width: 0; background: white; border: 1px solid #dce9fb; border-radius: 8px; padding: 12px 14px; }
.ex-tool-counts > article > span { font-size: 14px; color: #456084; overflow-wrap: anywhere; }
.ex-tool-counts b { color: #193a6b; font-size: 24px; line-height: 1.2; }
@media (max-width: 760px) { .ex-tool-summary { grid-template-columns: minmax(0, 1fr); } }
.ex-snippet-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.ex-snippet-full { max-height: 320px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; font: 14px/1.7 Consolas, 'Microsoft YaHei', monospace; margin-bottom: 0; }
.ex-event-description { display: block; min-height: 1.5em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: default; }
.ex-columns {
  display: grid;
  grid-template-columns: 20% minmax(0, 52%) minmax(0, 28%);
  gap: 10px;
  padding-right: 20px;
}
.ex-card h3 {
  font-size: 16px;
  margin: 0 0 12px;
}
.ex-search,
.ex-toolbar {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.ex-sample {
  display: block;
  width: 100%;
  text-align: left;
  background: #f9fcff;
  border: 1px solid #dce9fb;
  border-radius: 8px;
  margin: 8px 0;
  padding: 12px;
  color: inherit;
  cursor: pointer;
}
.ex-sample > span:last-of-type {
  float: right;
}
.ex-sample small {
  display: block;
  margin-top: 8px;
}
.selected {
  outline: 2px solid #146df5 !important;
  background: #edf5ff !important;
}
.high {
  color: #d92929 !important;
  background: #fff0f0 !important;
}
.medium {
  color: #c87515 !important;
  background: #fff5e7 !important;
}
.low {
  color: #146df5;
}
.ex-graph {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 24px 12px;
  max-height: 420px;
  overflow: auto;
  padding: 4px;
}
.ex-graph button,
.ex-chain button {
  padding: 8px 4px;
  border: 1px solid #c6dfff;
  border-radius: 7px;
  background: #edf6ff;
  color: #193a6b;
  cursor: pointer;
}
.ex-chain {
  display: flex;
  gap: 18px;
  overflow: auto;
}
.ex-chain button {
  min-width: 110px;
}
.ex-content {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 12px;
}
.ex-content article {
  padding: 10px;
  background: #f7faff;
  border: 1px solid #e2ebf7;
  border-radius: 8px;
}
.ex-content p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.7;
}
mark {
  background: #ffeb92;
}
dl {
  display: grid;
  grid-template-columns: 90px 1fr;
  font-size: 13px;
}
dt,
dd {
  margin: 0;
  padding: 8px;
  border: 1px solid #e3ecf8;
}
.ex-bar {
  display: grid;
  grid-template-columns: 110px 1fr;
  align-items: center;
  margin: 12px 0;
}
.ex-pattern {
  display: block;
  width: 100%;
  border: 1px solid #dce9fb;
  background: white;
  padding: 8px;
  text-align: left;
  color: inherit;
}
.ex-pattern small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ex-pattern-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ex-pattern-panel > h3,
.ex-pattern-panel > .ex-pattern-heading {
  flex-shrink: 0;
}
.ex-pattern-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}
.ex-table {
  max-height: 300px;
  overflow: auto;
}
table {
  border-collapse: collapse;
  width: 100%;
  font-size: 13px;
}
th {
  position: sticky;
  top: 0;
  background: #e7f1ff;
}
td,
th {
  padding: 8px;
  border: 1px solid #e3ecf8;
  text-align: left;
}
tr {
  cursor: pointer;
}
.ex-log {
  margin-top: 10px;
}
.ex-original-evidence { min-height: 72px; max-height: 70vh; overflow: auto; }
.ex-original-evidence section { margin-top: 16px; }
.ex-original-evidence h4 { margin: 0 0 6px; }
.ex-original-evidence pre { margin: 0; padding: 10px; background: #f7faff; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; }
.ex-evidence-cell { display: flex; align-items: center; gap: 8px; min-width: 0; }
.ex-evidence-preview { display: block; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ex-evidence-cell .el-button { flex: none; }
small {
  color: #7186a1;
}
.el-button--primary {
  --el-color-primary: #146df5;
}
@media (max-width: 1200px) {
  .ex-columns {
    grid-template-columns: 250px 1fr;
  }
  .ex-columns > aside:last-child {
    grid-column: 1/-1;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .ex-graph {
    grid-template-columns: repeat(3, 1fr);
  }
}
@media (max-width: 760px) {
  .ex-columns {
    display: block;
    padding: 0;
  }
  .ex-content {
    grid-template-columns: 1fr;
  }
  .ex-toolbar {
    flex-wrap: wrap;
  }
}
</style>
<style src="./execution-reference.css"></style>
