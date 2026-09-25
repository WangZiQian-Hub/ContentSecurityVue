<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import PanelCard from '../../components/PanelCard.vue'
import ValueMetrics from './components/ValueMetrics.vue'
import ValueChart from './components/ValueChart.vue'
import { isMock } from '../../api/request'
import * as api from '../../api/data-value'
import type {
  ValueOptions,
  ValueResult,
  ValueSample,
  ValueSampleQuery,
  ValueScope,
  ValueTask,
} from '../../types/data-value'

const options = ref<ValueOptions>()
const scope = reactive<ValueScope>({ datasetId: 0, versionId: '', language: '', schemeId: '' })
const versions = computed(
  () => options.value?.datasets.find((item) => item.id === scope.datasetId)?.versions ?? [],
)
const languages = computed(
  () => versions.value.find((item) => item.id === scope.versionId)?.languages ?? [],
)
const scopeKey = () => JSON.stringify(scope)
const ready = computed(
  () => !!(scope.datasetId && scope.versionId && scope.language && scope.schemeId),
)
const result = ref<ValueResult | null>()
const loading = ref(false)
const optionsFailed = ref(false)
const resultFailed = ref(false)
const rows = ref<ValueSample[]>([])
const selected = ref<ValueSample>()
const sampleLoading = ref(false)
const sampleFailed = ref(false)
const total = ref(0)
const query = reactive<ValueSampleQuery>({
  page: 1,
  pageSize: 10,
  tier: 'all',
  keyword: '',
  bin: '',
})
const keywordInput = ref('')
const detailOpen = ref(false)
const infoOpen = ref(false)
const distributionOpen = ref(false)
const historyOpen = ref(false)
const historyLoading = ref(false)
const historyFailed = ref(false)
const tasks = ref<ValueTask[]>([])
const creating = ref(false)
let resultSeq = 0
let sampleSeq = 0
let historySeq = 0
const tierNames = { high: '高价值', medium: '中价值', low: '低价值', unavailable: '不可评估' }
const statusNames = {
  pending: '等待执行',
  running: '分析中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
}
const metrics = computed(() => {
  const r = result.value
  return [
    {
      label: '当前范围综合价值分',
      value: r?.meanScore ?? null,
      unit: '/ 100',
      icon: 'Trophy',
      note: r ? `${r.languageName}语料 · 有效评分样本均值` : '等待分析结果',
    },
    {
      label: '高价值语料占比',
      value: r && r.validCount ? (r.highCount / r.validCount) * 100 : null,
      unit: '%',
      icon: 'Document',
      note: r
        ? `${r.highCount.toLocaleString()} / ${r.validCount.toLocaleString()} 条 · ≥ ${r.highThreshold} 分`
        : '等待分析结果',
    },
    {
      label: '有效评分样本',
      value: r?.validCount ?? null,
      unit: '条',
      icon: 'Coin',
      note: r
        ? `目标 ${r.targetCount.toLocaleString()} · 失败 ${r.failedCount} · 不可评估 ${r.unavailableCount}`
        : '等待分析结果',
    },
    {
      label: '结果覆盖语种',
      value: r?.languages.length ?? null,
      unit: '种',
      icon: 'Position',
      note: r?.languages.join(' / ') ?? '等待分析结果',
    },
  ]
})
function resetVersion() {
  scope.language = languages.value[0]?.code ?? 'all'
}
function resetDataset() {
  scope.versionId = versions.value[0]?.id ?? ''
  resetVersion()
}
async function loadOptions() {
  optionsFailed.value = false
  try {
    options.value = await api.getValueOptions()
    scope.schemeId = options.value.schemes[0]?.id ?? ''
    scope.datasetId = options.value.datasets[0]?.id ?? 0
    resetDataset()
  } catch {
    optionsFailed.value = true
  }
}
async function loadSamples() {
  const seq = ++sampleSeq
  rows.value = []
  selected.value = undefined
  sampleFailed.value = false
  if (!result.value) {
    total.value = 0
    return
  }
  // 翻页加载期间保留总条数，避免分页组件将当前页钳回第一页。
  sampleLoading.value = true
  try {
    const data = await api.listValueSamples(result.value.id, { ...query })
    if (seq !== sampleSeq) return
    rows.value = data.items
    total.value = data.total
    selected.value = data.items[0]
  } catch {
    if (seq === sampleSeq) sampleFailed.value = true
  } finally {
    if (seq === sampleSeq) sampleLoading.value = false
  }
}
async function loadResult(id?: string) {
  const seq = ++resultSeq
  ++sampleSeq
  result.value = undefined
  rows.value = []
  selected.value = undefined
  total.value = 0
  sampleLoading.value = false
  resultFailed.value = false
  sampleFailed.value = false
  keywordInput.value = ''
  Object.assign(query, { page: 1, tier: 'all', keyword: '', bin: '' })
  loading.value = false
  if (!ready.value) return
  loading.value = true
  try {
    const data = id ? await api.getValueResult(id) : await api.getLatestValueResult({ ...scope })
    if (seq !== resultSeq) return
    if (
      data &&
      (data.scope.datasetId !== scope.datasetId ||
        data.scope.versionId !== scope.versionId ||
        data.scope.language !== scope.language ||
        data.scope.schemeId !== scope.schemeId)
    )
      throw new Error('分析结果与当前范围不一致')
    result.value = data
    await loadSamples()
  } catch {
    if (seq === resultSeq) resultFailed.value = true
  } finally {
    if (seq === resultSeq) loading.value = false
  }
}
watch(scopeKey, () => {
  historyOpen.value = false
  historyLoading.value = false
  historyFailed.value = false
  infoOpen.value = false
  distributionOpen.value = false
  ++historySeq
  tasks.value = []
  detailOpen.value = false
  void loadResult()
})
watch(
  () => [
    query.page,
    query.pageSize,
    query.tier,
    query.keyword,
    query.bin,
    query.sortBy,
    query.sortOrder,
  ],
  () => void loadSamples(),
)
function changeSort({ prop, order }: { prop: string; order: 'ascending' | 'descending' | null }) {
  query.page = 1
  query.sortBy = order && (prop === 'score' || prop === 'tier') ? prop : undefined
  query.sortOrder = query.sortBy ? (order === 'ascending' ? 'asc' : 'desc') : undefined
}
function search() {
  query.page = 1
  query.keyword = keywordInput.value.trim()
}
function chooseTier(tier: ValueSampleQuery['tier']) {
  query.page = 1
  query.tier = tier
  query.bin = ''
}
function chooseBin(bin: string) {
  query.page = 1
  query.tier = 'all'
  query.bin = bin
}
async function showHistory() {
  historyOpen.value = true
  historyLoading.value = true
  historyFailed.value = false
  const seq = ++historySeq
  try {
    const data = await api.listValueTasks({ ...scope })
    if (seq === historySeq) tasks.value = data.items
  } catch {
    if (seq === historySeq) historyFailed.value = true
  } finally {
    if (seq === historySeq) historyLoading.value = false
  }
}
async function analyze() {
  if (!ready.value || creating.value) return
  if (isMock) {
    ElMessage.info('示例模式展示已有结果；重新分析需连接后端服务。')
    return
  }
  creating.value = true
  const key = scopeKey()
  try {
    const task = await api.createValueTask({ ...scope })
    ElMessage.success('分析任务已提交')
    if (key !== scopeKey()) return
    tasks.value = [task]
    historyOpen.value = true
  } catch {
    /* 请求层统一展示错误。 */
  } finally {
    creating.value = false
  }
}
async function refreshTask(task: ValueTask) {
  if (isMock) return
  const key = scopeKey()
  try {
    const updated = await api.getValueTask(task.taskId)
    if (key !== scopeKey()) return
    tasks.value = tasks.value.map((item) => (item.taskId === task.taskId ? updated : item))
    if (updated.status === 'succeeded' && updated.resultId) await loadResult(updated.resultId)
  } catch {
    /* 请求层统一展示错误。 */
  }
}
function explain(row: ValueSample) {
  selected.value = row
  detailOpen.value = true
}
function openHistoryResult(id: string) {
  historyOpen.value = false
  void loadResult(id)
}
function exportPage() {
  const cell = (value: unknown) => {
    let text = String(value ?? '')
    if (/^[=+@-]/.test(text)) text = `'${text}`
    return `"${text.replaceAll('"', '""')}"`
  }
  const content = [
    ['样本ID', '语料摘要', '语种', '综合评分', '价值档位'],
    ...rows.value.map((row) => [row.id, row.text, row.language, row.score, tierNames[row.tier]]),
  ]
    .map((row) => row.map(cell).join(','))
    .join('\r\n')
  const url = URL.createObjectURL(
    new Blob(['\ufeff', content], { type: 'text/csv;charset=utf-8;' }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${isMock ? '示例-' : ''}语料价值明细-第${query.page}页.csv`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
onBeforeUnmount(() => {
  ++resultSeq
  ++sampleSeq
  ++historySeq
})
onMounted(loadOptions)
</script>
<template>
  <div class="value-page">
    <el-alert
      v-if="isMock"
      title="演示数据：展示预存分析快照；评分与证据仅用于演示，未连接真实模型服务。"
      type="warning"
      :closable="false"
    />
    <PanelCard title="当前数据集分析" icon="DataAnalysis">
      <template #extra><span class="muted">下方结果随分析范围变化</span></template>
      <el-alert v-if="optionsFailed" title="分析选项加载失败" type="error" :closable="false"
        ><el-button link @click="loadOptions">重试</el-button></el-alert
      >
      <div class="value-filters">
        <label
          >数据集<el-select
            v-model="scope.datasetId"
            filterable
            placeholder="选择数据集"
            @change="resetDataset"
            ><el-option
              v-for="item in options?.datasets"
              :key="item.id"
              :label="item.name"
              :value="item.id" /></el-select
        ></label>
        <label
          >版本<el-select v-model="scope.versionId" @change="resetVersion"
            ><el-option
              v-for="item in versions"
              :key="item.id"
              :label="item.label"
              :value="item.id" /></el-select
        ></label>
        <label
          >语种<el-select v-model="scope.language"
            ><el-option label="全部语种" value="all" /><el-option
              v-for="item in languages"
              :key="item.code"
              :label="item.name"
              :value="item.code" /></el-select
        ></label>
        <label
          >评分方案<el-select v-model="scope.schemeId"
            ><el-option
              v-for="item in options?.schemes"
              :key="item.id"
              :label="item.name"
              :value="item.id" /></el-select
        ></label>
        <el-button
          type="primary"
          :loading="creating"
          :disabled="!ready || loading || resultFailed"
          @click="analyze"
          >{{ result ? '重新分析' : '开始分析' }}</el-button
        >
        <el-button :disabled="!ready" @click="showHistory">历史结果</el-button>
      </div>
      <div v-if="result" class="value-result-line">
        <span
          >当前结果：{{ result.versionLabel }} / {{ result.languageName }} /
          {{ result.schemeName }} · 分析时间 ·
          {{ new Date(result.finishedAt).toLocaleString('zh-CN') }}</span
        ><el-button link type="primary" @click="showHistory">查看任务 ›</el-button>
      </div>
      <div v-else class="muted">
        {{
          loading
            ? '正在加载当前范围的分析结果…'
            : resultFailed
              ? '当前范围查询失败'
              : '当前范围尚未分析'
        }}
      </div>
      <el-alert v-if="resultFailed" title="分析结果加载失败，请重试" type="error" :closable="false"
        ><el-button link @click="loadResult()">重试</el-button></el-alert
      >
    </PanelCard>
    <ValueMetrics :items="metrics" />
    <div v-if="result" class="value-charts">
      <PanelCard title="多维价值画像" icon="Odometer"
        ><template #extra
          ><el-button link type="primary" @click="infoOpen = true">维度明细 ›</el-button></template
        ><ValueChart v-if="result.validCount" kind="radar" :result="result" />
        <el-empty v-else description="暂无有效评分样本" :image-size="80" />
        <p class="chart-note">当前范围均值 · 评分方案定义维度权重</p></PanelCard
      >
      <PanelCard title="综合价值分数分布" icon="Histogram"
        ><template #extra
          ><el-button link type="primary" @click="distributionOpen = true"
            >分布明细 ›</el-button
          ></template
        ><ValueChart v-if="result.validCount" kind="bar" :result="result" @select-bin="chooseBin" />
        <el-empty v-else description="暂无有效评分样本" :image-size="80" />
        <p class="chart-note">
          共 {{ result.validCount.toLocaleString() }} 条有效评分 · 点击柱形筛选下方列表
        </p></PanelCard
      >
      <PanelCard title="样本价值解释" icon="Opportunity"
        ><template #extra
          ><el-button link type="primary" :disabled="!selected" @click="detailOpen = true"
            >完整解释 ›</el-button
          ></template
        >
        <template v-if="selected"
          ><div class="sample-score">
            {{ selected.id }} · 综合评分 {{ selected.score ?? '不可评估' }}
          </div>
          <h3 class="sample-title">{{ selected.text }}</h3>
          <div v-for="item in selected.dimensions.slice(0, 3)" :key="item.name" class="reason-row">
            <b>{{ item.name }} {{ item.score }}</b
            ><span
              >{{ item.reason }}
              <blockquote v-for="(evidence, index) in item.evidence" :key="index">
                原文证据：{{ evidence }}
              </blockquote></span
            >
          </div>
          <p v-if="selected.unavailableReason">{{ selected.unavailableReason }}</p>
          <p class="muted">解释对象为选中样本，不代表整个数据集。</p></template
        >
        <el-empty v-else description="请选择一个样本查看解释" :image-size="65" />
      </PanelCard>
    </div>
    <PanelCard title="语料价值明细" icon="Document">
      <div class="value-list-toolbar">
        <div class="value-list-tabs">
          <button :class="{ active: query.tier === 'all' }" @click="chooseTier('all')">
            全部（{{
              (result ? result.validCount + result.unavailableCount : 0).toLocaleString()
            }}）</button
          ><button :class="{ active: query.tier === 'high' }" @click="chooseTier('high')">
            高价值（{{ result?.highCount.toLocaleString() ?? 0 }}）</button
          ><button
            :class="{ active: query.tier === 'unavailable' }"
            @click="chooseTier('unavailable')"
          >
            不可评估（{{ result?.unavailableCount.toLocaleString() ?? 0 }}）
          </button>
        </div>
        <el-input
          v-model="keywordInput"
          clearable
          placeholder="输入样本ID或关键词，回车搜索"
          aria-label="搜索语料明细"
          @change="search"
        /><el-button type="primary" :disabled="!rows.length || sampleLoading" @click="exportPage"
          >导出本页</el-button
        >
      </div>
      <el-tag v-if="query.bin" closable class="bin-tag" @close="chooseBin('')"
        >分数区间：{{ result?.bins.find((item) => item.id === query.bin)?.label }}</el-tag
      >
      <el-alert v-if="sampleFailed" title="明细加载失败" type="error" :closable="false"
        ><el-button link @click="loadSamples">重试</el-button></el-alert
      >
      <el-table
        v-loading="sampleLoading || loading"
        :data="rows"
        highlight-current-row
        :current-row-key="selected?.id"
        row-key="id"
        empty-text="当前范围没有匹配的样本"
        @sort-change="changeSort"
        @row-click="(row: ValueSample) => (selected = row)"
      >
        <el-table-column prop="id" label="样本ID" width="120" /><el-table-column
          prop="text"
          label="语料摘要"
          min-width="250"
          show-overflow-tooltip
        /><el-table-column prop="language" label="语种" width="90" />
        <el-table-column prop="score" label="综合评分" width="130" sortable="custom"
          ><template #default="{ row }">{{
            row.score === null ? '—' : row.score.toFixed(1)
          }}</template></el-table-column
        >
        <el-table-column prop="tier" label="价值档位" width="130" sortable="custom"
          ><template #default="{ row }: { row: ValueSample }"
            ><el-tag
              :type="row.tier === 'high' ? 'success' : row.tier === 'medium' ? 'warning' : 'info'"
              >{{ tierNames[row.tier] }}</el-tag
            ></template
          ></el-table-column
        >
        <el-table-column label="操作" width="105"
          ><template #default="{ row }"
            ><el-button link type="primary" @click.stop="explain(row)"
              >查看解释</el-button
            ></template
          ></el-table-column
        >
      </el-table>
      <el-pagination
        v-model:current-page="query.page"
        v-model:page-size="query.pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        @size-change="query.page = 1"
      />
    </PanelCard>
    <el-dialog v-model="infoOpen" title="评分口径与维度明细" width="min(640px, 92vw)"
      ><p>{{ options?.schemes.find((item) => item.id === scope.schemeId)?.description }}</p>
      <p>
        高价值 ≥ {{ result?.highThreshold }} 分；中价值 ≥
        {{ result?.mediumThreshold }}
        分且低于高价值阈值；其余有效样本为低价值。不可评估与执行失败不计入评分均值。
      </p>
      <el-table :data="result?.dimensions"
        ><el-table-column prop="name" label="维度" /><el-table-column
          prop="score"
          label="当前均值" /><el-table-column
          prop="reason"
          label="说明"
          min-width="220" /></el-table
    ></el-dialog>
    <el-dialog v-model="distributionOpen" title="分数分布明细" width="min(520px, 92vw)"
      ><p>区间左闭右开，最后一个区间包含 100 分；仅统计有效评分样本。</p>
      <el-table :data="result?.bins"
        ><el-table-column prop="label" label="分数区间" /><el-table-column
          prop="count"
          label="样本数" /></el-table
    ></el-dialog>
    <el-drawer v-model="detailOpen" title="样本价值完整解释" size="min(540px, 95vw)"
      ><template v-if="selected"
        ><h3>{{ selected.id }} · {{ selected.text }}</h3>
        <p>
          语种：{{ selected.language }} · 综合评分：{{ selected.score ?? '不可评估' }} ·
          {{ tierNames[selected.tier] }}
        </p>
        <p v-if="selected.unavailableReason">{{ selected.unavailableReason }}</p>
        <div v-for="item in selected.dimensions" :key="item.name" class="reason-row">
          <b>{{ item.name }} {{ item.score }}</b
          ><span
            >{{ item.reason }}
            <blockquote v-for="(evidence, index) in item.evidence" :key="index">
              原文证据：{{ evidence }}
            </blockquote></span
          >
        </div>
        <p class="muted">解释仅针对本样本，评分方案：{{ result?.schemeName }}。</p></template
      ></el-drawer
    >
    <el-dialog v-model="historyOpen" title="当前分析范围 · 最近分析任务" width="min(850px, 95vw)"
      ><el-alert v-if="historyFailed" title="任务记录加载失败" type="error" :closable="false"
        ><el-button link @click="showHistory">重试</el-button></el-alert
      ><el-table v-loading="historyLoading" :data="tasks" empty-text="当前范围暂无分析任务"
        ><el-table-column
          prop="taskId"
          label="任务ID"
          min-width="180"
          show-overflow-tooltip
        /><el-table-column label="状态" width="110"
          ><template #default="{ row }: { row: ValueTask }">{{
            statusNames[row.status]
          }}</template></el-table-column
        ><el-table-column prop="createdAt" label="创建时间" min-width="170" /><el-table-column
          label="操作 / 原因"
          min-width="170"
          ><template #default="{ row }: { row: ValueTask }"
            ><el-button
              v-if="row.resultId && row.status === 'succeeded'"
              link
              type="primary"
              @click="openHistoryResult(row.resultId)"
              >查看结果</el-button
            ><el-button
              v-else-if="['pending', 'running'].includes(row.status)"
              link
              type="primary"
              @click="refreshTask(row)"
              >刷新任务</el-button
            ><span v-else>{{ row.errorMessage || statusNames[row.status] }}</span></template
          ></el-table-column
        ></el-table
      >
      <p class="muted">最多展示当前范围最近 20 个任务；进行中的任务可手动刷新状态。</p></el-dialog
    >
  </div>
</template>
<style scoped>
.value-page {
  display: grid;
  gap: 14px;
}
.muted,
.chart-note {
  color: #6c85ad;
  font-size: 12px;
  line-height: 1.6;
}
.value-filters {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.value-filters label {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  color: #23467d;
}
.value-filters .el-select {
  width: 125px;
}
.value-filters label:first-child .el-select {
  width: 220px;
}
.value-filters label:nth-child(4) .el-select {
  width: 185px;
}
.value-filters .el-button + .el-button {
  margin-left: 0;
}
.value-result-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  background: #edf6ff;
  padding: 5px 10px;
  margin-top: 12px;
  font-size: 12px;
  color: #31588d;
  border-radius: 5px;
}
.value-charts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.chart-note {
  text-align: center;
  margin: 0;
}
.sample-score {
  padding: 8px;
  background: #e8f3ff;
  color: #087bff;
  border-radius: 5px;
  font-size: 14px;
  font-weight: 600;
}
.sample-title {
  font-size: 15px;
  line-height: 1.7;
  color: #133675;
  margin: 12px 0;
}
.reason-row {
  display: flex;
  gap: 12px;
  margin: 10px 0;
  padding: 10px;
  background: #f0f7ff;
  border-radius: 5px;
  font-size: 12px;
  line-height: 1.6;
}
.reason-row b {
  color: #1265c3;
  flex: 0 0 92px;
}
.reason-row span {
  color: #45618d;
}
.value-list-toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.value-list-toolbar .el-input {
  width: 225px;
  margin-left: auto;
}
.value-list-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.value-list-tabs button {
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #44628d;
  padding: 9px 12px;
  cursor: pointer;
}
.value-list-tabs button.active {
  background: #eaf4ff;
  color: #087bff;
  border-bottom-color: #087bff;
}
.bin-tag {
  margin-bottom: 10px;
}
.value-page :deep(.el-table) {
  --el-table-header-bg-color: #edf6ff;
  --el-table-header-text-color: #335991;
  --el-table-border-color: #edf3fa;
  color: #26497c;
}
.value-page :deep(.el-pagination) {
  margin-top: 15px;
  justify-content: flex-end;
}
@media (max-width: 1100px) {
  .value-charts {
    grid-template-columns: 1fr 1fr;
  }
  .value-charts > :last-child {
    grid-column: 1 / -1;
  }
}
@media (max-width: 700px) {
  .value-charts {
    grid-template-columns: 1fr;
  }
  .value-result-line {
    align-items: flex-start;
    flex-direction: column;
  }
  .value-list-toolbar .el-input {
    margin-left: 0;
  }
  .value-filters label {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
