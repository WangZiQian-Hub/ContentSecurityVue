<script setup lang="ts">
import ViewExportStatus from './ViewExportStatus.vue'
import { traceBatchLabel } from '../../../../utils/agent-trace-presentation'
const autoViewExport = ref(false)
import { computed, onUnmounted, ref, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useComplianceStore } from '../../../../stores/compliance'
import { useAgentTraceStore } from '../../../../stores/agent-traces'
import { useAgentTraceStatisticsStore } from '../../../../stores/agent-trace-statistics'
import { createAgentTraceStatisticsMock } from '../../../../mock/agent-trace-statistics'
import {
  statisticMetric,
  statisticNumber as num,
  statisticSeconds as seconds,
  statisticStatus as status,
  statisticStatusType as statusType,
} from '../../../../utils/agent-trace-statistics'
import AppIcon from '../../../../components/AppIcon.vue'
import TraceStatisticsCharts from './TraceStatisticsCharts.vue'
import TraceSampleJsonDrawer from './TraceSampleJsonDrawer.vue'
import type {
  AgentTraceListFilter,
  AgentTraceStatisticsQuery,
} from '../../../../types/agent-trace-statistics'
const parent = useComplianceStore(),
  source = useAgentTraceStore(),
  store = useAgentTraceStatisticsStore(),
  route = useRoute(),
  router = useRouter()
const draft = ref({ batchId: '', language: 'all' }),
  packageDialog = ref(false),
  exportStarting = ref(false),
  subset = ref(false),
  contents = ref(['stats_summary', 'sample_table', 'normalized_json', 'manifest'])
const w = computed(() => store.workspace)
const rowClass = ({ row }: { row: { traceId: string } }) =>
  row.traceId === store.selectedId ? 'ats-selected' : ''
const labels = [
  '样本',
  '安全风险样本',
  '已记录 Token',
  '推理/输出比',
  '工具调用',
  '工具种类',
  '平均步骤',
  '流程完成率',
]
const keys = [
  'sampleCount',
  'riskSampleCount',
  'recordedTokens',
  'reasoningOutputRatio',
  'toolCallCount',
  'toolTypeCount',
  'averageSteps',
  'taskSuccessRate',
] as const
const icons = ['Coin', 'Warning', 'Files', 'DataAnalysis', 'SetUp', 'Box', 'Share', 'Aim']
const tabs: { code: AgentTraceListFilter; label: string }[] = [
  { code: 'all', label: '全部样本' },
  { code: 'risk', label: '安全风险' },
  { code: 'missing_fields', label: '缺失字段' },
]
const contentLabels: Record<string, string> = {
  stats_summary: '统计汇总',
  sample_table: '样本明细',
  normalized_json: '标准化 JSON',
  manifest: '文件清单',
}
function batchLabel(batch: {
  name?: string
  displayId: string
  sampleCount: number
  languages: { code: string; count: number }[]
}) {
  const languageNames: Record<string, string> = {
    zh: '中文',
    en: 'English',
    other: '其他',
    unknown: '未知',
  }
  return `${traceBatchLabel(batch)}（共${batch.sampleCount}样本，${batch.languages
    .filter((l) => l.count > 0)
    .map((l) => `${languageNames[l.code] || l.code} ${l.count}`)
    .join(' / ')}）`
}
const changed = computed(
  () =>
    draft.value.batchId !== store.query.batchId || draft.value.language !== store.query.language,
)
let alive = true,
  modeVersion = 0,
  trigger: HTMLElement | null = null,
  focusTraceId = ''
function initialQuery(): AgentTraceStatisticsQuery {
  const q = route.query,
    r: AgentTraceStatisticsQuery = {}
  for (const k of ['batchId', 'snapshotId', 'projectionVersion', 'language'] as const)
    if (typeof q[k] === 'string') r[k] = q[k]
  if (['all', 'risk', 'missing_fields'].includes(String(q.listFilter)))
    r.listFilter = String(q.listFilter) as AgentTraceListFilter
  if (Number.isInteger(Number(q.page)) && Number(q.page) > 0) r.page = Number(q.page)
  return r
}
watch(
  () => parent.demo,
  async (mode, old) => {
    const version = ++modeVersion
    packageDialog.value = false
    store.configure(
      mode,
      mode ? createAgentTraceStatisticsMock((q) => source.statisticsSource(q), true) : undefined,
    )
    const q = old === undefined ? initialQuery() : {}
    const trace =
      old === undefined && typeof route.query.traceId === 'string' ? route.query.traceId : ''
    if (!alive || version !== modeVersion) return
    await store.load(q)
    if (!alive || version !== modeVersion) return
    draft.value = { batchId: store.query.batchId || '', language: store.query.language || 'all' }
    if (trace && store.workspace?.scope) await store.select(trace)
  },
  { immediate: true },
)
watch(
  () => [store.query.batchId, store.query.snapshotId, store.selectedId, store.loading],
  () => {
    if (route.query.view !== 'statistics' || !store.workspace?.scope || store.loading) return
    const next = {
      view: 'statistics',
      batchId: store.query.batchId,
      snapshotId: store.query.snapshotId,
      traceId:
        store.selectedId ||
        (typeof route.query.traceId === 'string' ? route.query.traceId : undefined),
    }
    if (JSON.stringify(route.query) !== JSON.stringify(next)) void router.replace({ query: next })
  },
)
watch(
  () => store.selectedId,
  (id) => {
    if (id) focusTraceId = id
  },
)
async function restoreFocus() {
  await nextTick()
  const button = trigger?.isConnected
    ? trigger
    : Array.from(document.querySelectorAll<HTMLElement>('[data-ats-trace]')).find(
        (el) => el.dataset.atsTrace === focusTraceId,
      )
  button?.focus({ preventScroll: true })
}
async function query() {
  await router.replace({ query: { view: 'statistics', batchId: draft.value.batchId } })
  await store.load({
    batchId: draft.value.batchId || undefined,
    language: draft.value.language,
    listFilter: 'all',
    page: 1,
  })
  if (store.workspace?.scope) {
    draft.value = { batchId: store.query.batchId!, language: store.query.language! }
  }
}
function select(id: string, event: Event) {
  trigger = event.currentTarget as HTMLElement
  void store.select(id)
}
async function exportPackage() {
  autoViewExport.value = false
  await store.exportResult('package', subset.value, contents.value)
  if (!store.exportError) packageDialog.value = false
}
defineExpose({
  exportView: async () => {
    store.task = null
    autoViewExport.value = true
    exportStarting.value = true
    try {
      await store.exportResult('view')
    } finally {
      exportStarting.value = false
    }
  },
  openPackage: () => {
    subset.value = false
    contents.value = (w.value?.exportOptions.contents || [])
      .filter(
        (c) =>
          c.availability === 'available' &&
          ['stats_summary', 'sample_table', 'normalized_json', 'manifest'].includes(c.code),
      )
      .map((c) => c.code)
    packageDialog.value = true
  },
  canView: computed(() => store.exportAllowed('view') && !store.exportBusy),
  canPackage: computed(() => store.exportAllowed('package') && !store.exportBusy),
})
onUnmounted(() => {
  alive = false
  store.dispose()
})
</script>
<template>
  <section class="ats-statistics">
    <ViewExportStatus
      v-if="autoViewExport && (store.task || exportStarting || store.exportError)"
      :task="store.task"
      :error="store.exportError"
      :download="(a) => store.download(a.artifactId)"
    />
    <div
      v-if="!autoViewExport && (exportStarting || store.task || store.exportError)"
      class="ats-export-status"
      role="status"
      aria-live="polite"
    >
      <span
        >导出任务 · {{ exportStarting ? 'pending' : store.task?.status || 'failed' }} ·
        {{ store.exportScope?.batchId || store.query.batchId }}</span
      >
      <el-progress
        v-if="exportStarting || store.exportBusy"
        :percentage="exportStarting ? 0 : store.task?.progress || 0"
        :indeterminate="exportStarting || store.task?.progress == null"
      />
      <el-button
        v-if="
          !exportStarting &&
          store.task &&
          ['pending', 'running'].includes(store.task.status) &&
          !store.exportBusy
        "
        @click="store.resume"
        >恢复进度查询</el-button
      >
      <template v-if="!exportStarting && store.task?.status === 'succeeded'"
        ><el-button
          v-for="a in store.task.result?.artifacts || []"
          :key="a.artifactId"
          @click="store.download(a.artifactId)"
          >下载 {{ a.filename }}</el-button
        ></template
      >
      <span v-if="store.exportError" class="ats-export-error">{{ store.exportError }}</span>
      <el-button v-if="store.exportError" @click="store.retryExport">重试导出</el-button>
    </div>
    <form class="ats-filters" @submit.prevent="query">
      <label for="ats-batch">批次</label
      ><el-select
        id="ats-batch"
        v-model="draft.batchId"
        filterable
        remote
        :remote-method="store.options"
        aria-label="统计批次"
        class="ats-batch"
        ><el-option
          v-for="b in w?.batchOptions.items || []"
          :key="b.batchId"
          :value="b.batchId"
          :label="batchLabel(b)"
        /><template #footer
          ><el-button
            v-if="w && w.batchOptions.page < w.batchOptions.totalPages"
            text
            @click="store.options('', w.batchOptions.page + 1)"
            >更多批次</el-button
          ></template
        ></el-select
      ><label for="ats-language">语言</label
      ><el-select id="ats-language" v-model="draft.language" aria-label="统计语言"
        ><el-option
          v-for="l in w?.languageOptions || [{ code: 'all', label: '全部语言', count: 0 }]"
          :key="l.code"
          :value="l.code"
          :label="l.label" /></el-select
      ><el-button native-type="submit" type="primary" :loading="store.loading">查询</el-button
      ><small v-if="changed && w?.scope">条件已修改，点击查询生效</small>
    </form>
    <el-alert
      v-if="store.error"
      :title="store.error"
      type="error"
      :closable="false"
      show-icon
    /><el-button v-if="store.error" @click="query">重新查询</el-button>
    <el-skeleton v-if="store.loading" :rows="14" animated />
    <el-empty
      v-else-if="w && !w.scope"
      description="当前批次没有已发布快照，请先完成轨迹接入与解析"
    />
    <template v-else-if="w?.scope && w.permissions.canViewStatistics">
      <el-alert v-if="w.batchOptions.items.find(b => b.batchId === w?.scope?.batchId)?.activeSnapshotId && w.batchOptions.items.find(b => b.batchId === w?.scope?.batchId)?.activeSnapshotId !== w.scope.snapshotId" title="当前为历史快照，可查询最新审计结果。" type="info" :closable="false"><el-button link @click="query">查看最新结果</el-button></el-alert>
      <div class="ats-kpis">
        <article
          v-for="(key, i) in keys"
          :key="key"
          :title="
            w.kpis[key].reason ||
            `有效样本 ${w.kpis[key].validSampleCount} / ${w.kpis[key].eligibleSampleCount}`
          "
        >
          <AppIcon :name="icons[i]" />
          <div>
            <span>{{ labels[i] }}</span
            ><strong :class="{ risk: i === 1 }">{{ i === 1 && w.kpis[key].value == null ? '尚未审计' : statisticMetric(w.kpis[key]) }}</strong
            ><small v-if="i === 2 && w.kpis[key].estimatedSampleCount"
              >含估算 {{ w.kpis[key].estimatedSampleCount }} 条</small
            ><small v-if="i === 3">同口径 {{ w.kpis[key].validSampleCount }} 条</small>
          </div>
        </article>
      </div>
      <section v-if="w.auditSummary" class="trace-audit-summary">
        <b>规则审计 {{ w.auditSummary.completedSamples }} / {{ w.auditSummary.totalSamples }}</b>
        <span>策略拒绝样本 {{ w.auditSummary.policySamples }}</span><span>运行异常样本 {{ w.auditSummary.operationSamples }}</span><span>效率线索样本 {{ w.auditSummary.efficiencySamples }}</span>
        <small>{{ w.auditSummary.scope }}；各项按样本去重，可重叠。{{ w.auditSummary.version }}</small>
      </section>
      <TraceStatisticsCharts :data="w" />
      <section class="ats-samples">
        <div class="ats-list-tabs">
          <el-button
            v-for="t in tabs"
            :key="t.code"
            :type="store.query.listFilter === t.code ? 'primary' : 'default'"
            :disabled="!w.permissions.canListSamples || store.listLoading"
            @click="store.samples(1, t.code)"
            >{{ t.label }}（{{ t.code === 'missing_fields' ? w.completeness.missingUnionCount : w.listCounts[t.code] }}）</el-button
          ><small
            >缺失样本按 ID 去重。{{
              w.completeness.overlapSummary.timeAndReasoningCount
            }}
            条同时缺少任务耗时和推理 Token 用量。</small
          >
        </div>
        <el-alert
          v-if="store.listError"
          :title="store.listError"
          type="error"
          :closable="false"
        /><el-button
          v-if="store.listError"
          @click="store.samples(store.query.page, store.query.listFilter)"
          >重试列表</el-button
        >
        <el-empty v-if="!w.permissions.canListSamples" description="当前账号没有样本列表权限" />
        <el-table
          v-else
          v-loading="store.listLoading"
          :data="w.samplePage.items"
          row-key="traceId"
          :row-class-name="rowClass"
          size="small"
          empty-text="当前筛选范围没有样本"
          class="ats-sample-table"
        >
          <el-table-column label="样本 ID" min-width="102"
            ><template #default="{ row }"
              ><el-button
                link
                type="primary"
                :disabled="!row.allowedActions.viewDetail || !w.permissions.canViewDetail"
                :data-ats-trace="row.traceId"
                @click="select(row.traceId, $event)"
                >{{ row.displayId }}</el-button
              ></template
            ></el-table-column
          >
          <el-table-column label="语言" width="80"
            ><template #default="{ row }">{{
              { zh: '中文', en: 'English', other: '其他', unknown: '未知' }[
                row.language as string
              ] || '未知'
            }}</template></el-table-column
          >
          <el-table-column prop="testCategoryLabel" label="测试集类别" min-width="105" />
          <el-table-column label="输入 Token" min-width="100"
            ><template #default="{ row }">{{
              num(row.tokenUsage.input)
            }}</template></el-table-column
          >
          <el-table-column label="推理 Token" min-width="100"
            ><template #default="{ row }">{{
              num(row.tokenUsage.reasoningRecorded)
            }}</template></el-table-column
          >
          <el-table-column label="输出 Token" min-width="100"
            ><template #default="{ row }">{{
              num(row.tokenUsage.finalOutput)
            }}</template></el-table-column
          >
          <el-table-column label="步骤数" min-width="75"
            ><template #default="{ row }">{{ num(row.eventCount) }}</template></el-table-column
          >
          <el-table-column label="工具调用" min-width="85"
            ><template #default="{ row }">{{ num(row.callCount) }}</template></el-table-column
          >
          <el-table-column label="重试次数" min-width="85"
            ><template #default="{ row }">{{ num(row.retryCount) }}</template></el-table-column
          >
          <el-table-column label="运行时长" min-width="90"
            ><template #default="{ row }">{{ seconds(row.durationMs) }}</template></el-table-column
          >
          <el-table-column label="调用结果" min-width="110"
            ><template #default="{ row }"
              ><el-tag :type="statusType(row.taskStatus)" size="small">{{
                status(row.taskStatus)
              }}</el-tag></template
            ></el-table-column
          >
          <el-table-column label="操作" min-width="120"
            ><template #default="{ row }"
              ><el-button
                link
                type="primary"
                :disabled="!row.allowedActions.viewDetail || !w.permissions.canViewDetail"
                :data-ats-trace="row.traceId"
                @click="select(row.traceId, $event)"
                >查看 JSON →</el-button
              ></template
            ></el-table-column
          >
        </el-table>
        <div class="ats-pagination">
          <span
            >共 {{ w.samplePage.total }} 条 · 每页 {{ w.samplePage.pageSize }} 条 ·
            {{ w.samplePage.page }}/{{ Math.max(1, w.samplePage.totalPages) }}</span
          ><el-pagination
            small
            background
            layout="prev, pager, next"
            :total="w.samplePage.total"
            :current-page="w.samplePage.page"
            :page-size="w.samplePage.pageSize"
            :disabled="store.listLoading || !w.permissions.canListSamples"
            @current-change="store.samples($event)"
          />
        </div>
      </section>
      <small v-for="warning in w.warnings" :key="warning.code" class="ats-warning">{{
        warning.message
      }}</small> </template
    ><el-empty
      v-else-if="w && !w.permissions.canViewStatistics"
      description="当前账号没有统计查看权限"
    />
    <TraceSampleJsonDrawer @closed="restoreFocus" />
    <el-dialog
      v-model="packageDialog"
      title="导出结果包"
      width="640px"
      align-center
      append-to-body
      class="ats-export-dialog trace-package-dialog"
      ><template v-if="w?.scope"
        ><h3 class="trace-package-section">统计指标 · 导出范围</h3>
        <p>批次 {{ w.scope.batchId }} · 快照 {{ w.scope.snapshotId }}</p>
        <el-radio-group v-model="subset"
          ><el-radio :value="false">当前查询范围全部样本（{{ w.listCounts.all }}）</el-radio
          ><el-radio :value="true"
            >当前列表子集（{{ w.samplePage.total }}）</el-radio
          ></el-radio-group
        >
        <p>汇总始终使用主查询范围，明细范围写入 manifest。</p>
        <el-checkbox-group v-model="contents"
          ><el-checkbox
            v-for="c in w.exportOptions.contents.filter((c) => c.code !== 'statistics_png')"
            :key="c.code"
            :value="c.code"
            :disabled="
              c.availability !== 'available' || w.exportOptions.requiredContents.includes(c.code)
            "
            >{{ contentLabels[c.code] || c.label
            }}{{ c.reason ? `（${c.reason}）` : '' }}</el-checkbox
          ></el-checkbox-group
        >
        <p>使用 standard 脱敏策略及样本编号匿名化，原始文件不默认导出。</p></template
      ><template #footer
        ><el-button @click="packageDialog = false">取消</el-button
        ><el-button
          type="primary"
          :loading="store.exportBusy"
          :disabled="!store.exportAllowed('package')"
          @click="exportPackage"
          >生成 ZIP</el-button
        ></template
      ></el-dialog
    >
  </section>
</template>
<style src="./agent-trace-statistics.css"></style>

<style scoped>
.trace-audit-summary{display:flex;flex-wrap:wrap;gap:12px;padding:12px;border:1px solid #d5e3f7;border-radius:8px;background:#fff;margin-bottom:12px;font-size:13px}.trace-audit-summary small{width:100%;color:#66788f}
</style>
