<script setup lang="ts">
import ViewExportStatus from './ViewExportStatus.vue'
import RuleFindings from './RuleFindings.vue'
import { traceBatchLabel } from '../../../../utils/agent-trace-presentation'
import { computed, ref, watch, onUnmounted, nextTick } from 'vue'
import ExecutionGraph from './ExecutionGraph.vue'
import ExecutionGlyph from './ExecutionGlyph.vue'
import AppIcon from '../../../../components/AppIcon.vue'
import { useRoute, useRouter } from 'vue-router'
import { useComplianceStore } from '../../../../stores/compliance'
import { useExecutionStore } from '../../../../stores/agent-trace-execution'
import { useExecutionExport } from '../../../../composables/useExecutionExport'
import { traceZip, tracePng } from '../../../../utils/agent-trace-export'
import { executionSamples } from '../../../../mock/agent-trace-execution'
import type { ExecutionText } from '../../../../types/agent-trace-execution'
const exportState = useExecutionExport()
const {
  busy: exporting,
  error: exportError,
  task: exportTask,
  progress: exportProgress,
  artifacts: exportArtifacts,
  batchId: exportBatchId,
  downloading: exportDownloading,
} = exportState
const lastExportKind = ref<'view' | 'package'>('view')
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
const duration = (n: number | null) => (n === null ? '未提供' : `${(n / 1000).toFixed(1)} s`)
const relativeTime = (n: number | null) =>
  n === null
    ? '未提供'
    : `${String(Math.floor(n / 60000)).padStart(2, '0')}:${String(Math.floor(n / 1000) % 60).padStart(2, '0')}.${String(n % 1000).padStart(3, '0')}`
const level = (v: string) =>
  ({ high: '高风险', medium: '中风险', low: '低风险', none: '无风险', unknown: '待审计' })[v] || v
let debounce: ReturnType<typeof setTimeout> | undefined
watch(
  () => parent.demo,
  (mode) => {
    exportState.reset()
    packageDialog.value = false
    void store.configure(
      mode,
      typeof route.query.batchId === 'string' ? route.query.batchId : undefined,
      typeof route.query.traceId === 'string' ? route.query.traceId : undefined,
      typeof route.query.eventId === 'string' ? route.query.eventId : undefined,
      typeof route.query.snapshotId === 'string' ? route.query.snapshotId : undefined,
    )
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
  () => s.value?.eventId,
  async () => {
    evidenceIndex.value = 0
    await nextTick()
    const row = document.getElementById(`execution-log-${s.value?.eventId}`)
    const container = row?.closest('.ex-table')
    if (row instanceof HTMLTableRowElement && container)
      container.scrollTop = Math.max(0, row.sectionRowIndex - 1) * row.offsetHeight
  },
)
onUnmounted(() => {
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
async function exportResult(kind: 'view' | 'package') {
  if (!store.canExport || !d.value || !w.value?.scope || exporting.value || exportDownloading.value)
    return
  store.pause()
  lastExportKind.value = kind
  const detail = d.value,
    scope = { ...w.value.scope },
    filters = { ...store.query },
    selectedEvent = s.value?.eventId,
    eventLabel = s.value?.displayId || '',
    scopeType = kind === 'view' ? 'sample' : packageScope.value
  const input = {
    ...scope,
    view: 'execution',
    exportKind: kind,
    format: kind === 'view' ? 'png' : 'zip',
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
      kind === 'view' ? ['execution_png'] : ['normalized_json', 'evidence_index', 'manifest'],
    redactionProfile: store.raw ? 'none' : 'standard',
    anonymizeIds: true,
    timezone: 'Asia/Shanghai',
    locale: 'zh-CN',
    uiVersion: 'agent-trace-execution-v1',
  }
  await exportState.start(input, parent.demo, async () => {
    if (kind === 'view')
      return tracePng([
        '智能体轨迹审计 · 思维路径',
        JSON.stringify(scope),
        detail.summary.displayId,
        '当前事件 ' + eventLabel,
        ...detail.graph.nodes.map((n) => n.ordinal + ' ' + n.label),
      ])
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
  canView: computed(() => store.canExport && !exporting.value && !exportDownloading.value),
  canPackage: computed(() => store.canExport && !exporting.value && !exportDownloading.value),
  exportView: () => exportResult('view'),
  openPackage: () => {
    packageDialog.value = true
  },
})
</script>
<template>
  <section class="execution-view">
    <ViewExportStatus
      v-if="lastExportKind === 'view' && exportTask"
      :task="exportTask"
      :error="exportError"
      :download="exportState.download"
    />
    <div
      v-if="lastExportKind !== 'view' && (exportTask || exportError)"
      class="ex-export-status"
      role="status"
      aria-live="polite"
    >
      <span>导出任务 · {{ exportTask?.status || 'failed' }} · {{ exportBatchId }}</span>
      <el-progress
        v-if="exporting"
        :percentage="exportProgress ?? 0"
        :indeterminate="exportProgress == null"
      />
      <el-button
        v-if="!exporting && exportTask && ['pending', 'running'].includes(exportTask.status)"
        @click="exportState.resume"
        >恢复进度查询</el-button
      >
      <el-button
        v-for="artifact in exportArtifacts"
        :key="artifact.artifactId"
        :loading="exportDownloading"
        @click="exportState.download(artifact)"
        >下载 {{ artifact.filename }}</el-button
      >
      <span v-if="exportError" class="ex-export-error">{{ exportError }}</span>
      <el-button
        v-if="exportError && exportTask?.status === 'failed'"
        :disabled="!store.canExport"
        @click="exportResult(lastExportKind)"
        >重新导出</el-button
      >
    </div>
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
    <RuleFindings v-if="d" :items="d.ruleFindings" :version="d.ruleAudit?.version" @locate="id => { store.pause(); store.select(id) }" />
    <div v-if="w" v-loading="store.loading" class="ex-columns">
      <aside class="ex-card ex-sample-panel">
        <h3 :title="`当前页 ${w.samplePage.items.length} 条，筛选命中 ${w.samplePage.total} 条`">
          样本检索与列表（{{ w.samplePage.total }}）
        </h3>
        <div class="ex-search">
          <el-input v-model="search" placeholder="搜索样本ID、风险类型或关键词" /><el-button
            aria-label="筛选"
            :aria-expanded="filter"
            @click="filter = !filter"
            ><AppIcon name="Filter"
          /></el-button>
        </div>
        <div class="ex-sample-scroll">
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
          ><section class="ex-card">
            <h3>
              思维路径
              <small
                >（{{ d.graph.nodes.length === d.graph.totalNodes ? '完整' : '已加载' }}
                {{ d.graph.totalNodes }} 个节点，已解析 {{ d.graph.nodes.length }} /
                {{ d.graph.totalNodes }}）</small
              >
            </h3>
            <ExecutionGraph
              :graph="d.graph"
              :selected="s?.eventId"
              @select="
                store.pause();   store.select($event)
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
              <h3>关键内容与推理摘要</h3>
              <el-radio-group :model-value="store.raw" @change="store.toggleRaw(Boolean($event))"
                ><el-radio-button :value="true" :disabled="!d.permissions.canViewRaw"
                  >原文</el-radio-button
                ><el-radio-button :value="false">脱敏</el-radio-button></el-radio-group
              >
            </div>
            <div class="ex-content">
              <article>
                <b>原始来源内容（节选）</b>
                <p>
                  <template v-for="(t, i) in tokens(s?.content.sourceExcerpt)" :key="i"
                    ><mark v-if="t.mark">{{ t.text }}</mark
                    ><span v-else>{{ t.text }}</span></template
                  >
                </p>
              </article>
              <article>
                <b>已记录推理摘要</b>
                <p>
                  <template v-for="(t, i) in tokens(s?.content.reasoningSummary)" :key="i"
                    ><mark v-if="t.mark">{{ t.text }}</mark
                    ><span v-else>{{ t.text }}</span></template
                  >
                </p>
                <small>{{ s?.content.reasoningSummary.provenance }}</small>
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
        <section class="ex-card">
          <h3>
            危险模式列表 <small>（共 {{ d.dangerPatterns.total }} 项）</small>
          </h3>
          <div class="ex-pattern-heading">
            <span>序号</span><span>危险模式</span><span>关键片段/特征</span><span>定位</span>
          </div>
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
            ><small>{{ p.snippet }}</small
            ><el-tag>{{ p.eventDisplayId }}</el-tag>
          </button>
        </section>
      </aside>
    </div>
    <section v-if="d" class="ex-card ex-log">
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
            @click="
              store.pause(); d.firstRiskEventId && store.select(d.firstRiskEventId)
            "
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
              <th>时间（相对）</th>
              <th>事件ID</th>
              <th>事件类型</th>
              <th>事件描述</th>
              <th>证据信息</th>
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
              <td>{{ relativeTime(e.relativeTimeMs) }}</td>
              <td>{{ e.displayId }}</td>
              <td>{{ e.label }}</td>
              <td>{{ e.description }}</td>
              <td>
                {{
                  e.evidenceSummary ||
                  e.selectionPreview.riskEvidence.items[0]?.matchPattern ||
                  (e.selectionPreview.lineage.nodes.length
                    ? '来源：' + e.selectionPreview.lineage.nodes[0]?.id
                    : '—')
                }}
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
      v-model="packageDialog"
      title="导出结果包"
      width="640px"
      align-center
      append-to-body
      class="trace-package-dialog"
      ><h3 class="trace-package-section">思维路径 · 导出范围</h3>
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
