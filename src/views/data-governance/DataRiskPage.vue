<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref } from 'vue'
import PanelCard from '../../components/PanelCard.vue'
import RiskChart from './components/RiskChart.vue'
import { languageName } from '../../utils/governance-language'
import { assertResultScope } from '../../utils/governance-scope'
import { TASK_STATUS } from '../../utils/enums'
import * as api from '../../api/data-risk'
import { isGovernanceLlm } from '../../api/governance-llm'
import type {
  Options,
  Query,
  Result,
  ReviewInput,
  RiskSortField,
  Rule,
  Sample,
  Scope,
  Task,
} from '../../types/data-risk'
const emit = defineEmits(['risk-updated'])
const options = ref<Options>(),
  result = ref<Result | null>(null),
  selected = ref<Sample>()
const scope = reactive<Scope>({ datasetId: 0, versionId: '', language: 'all', schemeId: '' })
const query = reactive<Query>({ page: 1, pageSize: 5, keyword: '', level: '', status: '' })
const rows = ref<Sample[]>([]),
  total = ref(0),
  loading = ref(false),
  busy = ref(false),
  error = ref(''),
  drawer = ref('')
const history = ref<Result[]>([]),
  task = ref<Task>(),
  activeRule = ref<Rule>(),
  knowledge = ref<Rule[]>([]),
  keyword = ref('')
const review = reactive<ReviewInput>({
  opinion: '',
  reviewer: '',
  decision: 'confirm',
  level: 'MEDIUM',
  category: '',
})
const dataset = computed(() => options.value?.datasets.find((d) => d.id === scope.datasetId))
const version = computed(() => dataset.value?.versions.find((v) => v.id === scope.versionId))
const scheme = computed(() => options.value?.schemes.find((s) => s.id === scope.schemeId))
const label = (level?: string) =>
  scheme.value?.levels.find((l) => l.level === level)?.label || level
const extraCategories = (sample: Sample) => new Set(sample.findings.map((f) => f.category)).size - 1
const color = (level: string) => scheme.value?.levels.find((l) => l.level === level)?.color
const relatedCases = computed(() =>
  selected.value?.cases.filter(
    (c) =>
      !activeRule.value ||
      (c.ruleId === activeRule.value.id && c.ruleVersion === activeRule.value.version),
  ),
)
let generation = 0,
  listGeneration = 0,
  selectionGeneration = 0,
  knowledgeGeneration = 0,
  timer: ReturnType<typeof setTimeout> | undefined
function clearSelection() {
  ++selectionGeneration
  ++knowledgeGeneration
  selected.value = undefined
  activeRule.value = undefined
  knowledge.value = []
  drawer.value = ''
  review.opinion = ''
}
async function safely(fn: () => Promise<void>) {
  busy.value = true
  error.value = ''
  try {
    await fn()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
async function choose(row: Sample) {
  clearSelection()
  const ticket = selectionGeneration,
    id = result.value?.id
  if (!id) return
  try {
    const s = await api.getRiskSample(id, row.id)
    if (ticket === selectionGeneration && id === result.value?.id) selected.value = s
  } catch (e) {
    if (ticket === selectionGeneration) error.value = String(e)
  }
}
async function loadRows() {
  const ticket = ++listGeneration,
    id = result.value?.id
  rows.value = []
  clearSelection()
  if (!id) return
  try {
    const page = await api.listRiskSamples(id, { ...query })
    if (ticket !== listGeneration || result.value?.id !== id) return
    rows.value = page.items
    total.value = page.total
    if (page.items[0]) await choose(page.items[0])
  } catch (e) {
    if (ticket === listGeneration) error.value = String(e)
  }
}
async function loadScope() {
  const ticket = ++generation
  ++listGeneration
  clearTimeout(timer)
  clearSelection()
  result.value = null
  rows.value = []
  total.value = 0
  task.value = undefined
  history.value = []
  error.value = ''
  Object.assign(query, { page: 1, keyword: '', level: '', status: '' })
  loading.value = true
  try {
    const r = await api.getLatestRisk({ ...scope })
    if (ticket !== generation) return
    assertResultScope(r, scope)
    result.value = r
    await loadRows()
  } catch (e) {
    if (ticket === generation) error.value = String(e)
  } finally {
    if (ticket === generation) loading.value = false
  }
}
function changeDataset() {
  scope.versionId = dataset.value?.versions[0]?.id || ''
  scope.language = 'all'
  void loadScope()
}
function changeVersion() {
  scope.language = 'all'
  void loadScope()
}
function filter(level = '', status = '') {
  Object.assign(query, { level, status, keyword: '', page: 1 })
  void loadRows()
}
function search() {
  query.page = 1
  void loadRows()
}
function sortRows({
  prop,
  order,
}: {
  prop: string
  order: 'ascending' | 'descending' | null
}) {
  query.page = 1
  if (order && (prop === 'maximumSuggestedLevel' || prop === 'status')) {
    query.sortBy = prop as RiskSortField
    query.sortOrder = order === 'ascending' ? 'asc' : 'desc'
  } else {
    delete query.sortBy
    delete query.sortOrder
  }
  void loadRows()
}
async function start() {
  await safely(async () => {
    const ticket = ++generation
    task.value = undefined
    ++listGeneration
    clearTimeout(timer)
    clearSelection()
    result.value = null
    rows.value = []
    total.value = 0
    Object.assign(query, { page: 1, level: '', status: '', keyword: '' })
    const t = await api.startRisk({ ...scope })
    if (ticket !== generation) return
    task.value = t
    async function poll() {
      try {
        const next = await api.getRiskTask(t.id)
        if (ticket !== generation) return
        task.value = next
        if (next.status === 'pending' || next.status === 'running') timer = setTimeout(poll, 2000)
        else if (next.status === 'succeeded' && next.resultId) {
          const saved = await api.getRiskResult(next.resultId)
          if (ticket !== generation) return
          assertResultScope(saved, scope)
          result.value = saved
          await loadRows()
          emit('risk-updated')
        }
      } catch (e) {
        if (ticket === generation) error.value = String(e)
      }
    }
    if (t.status === 'failed') return
    void poll()
  })
}
async function openHistory() {
  await safely(async () => {
    const ticket = generation
    const h = await api.getRiskHistory({ ...scope })
    if (ticket === generation) {
      history.value = h
      drawer.value = '历史结果'
    }
  })
}
async function useHistory(r: Result) {
  await safely(async () => {
    const ticket = ++generation
    clearTimeout(timer)
    ++listGeneration
    clearSelection()
    result.value = null
    rows.value = []
    total.value = 0
    task.value = undefined
    const saved = await api.getRiskResult(r.id)
    if (ticket !== generation) return
    assertResultScope(saved, scope)
    result.value = saved
    Object.assign(query, { page: 1, keyword: '', level: '', status: '' })
    await loadRows()
  })
}
async function openTask() {
  await safely(async () => {
    const ticket = generation,
      id = result.value?.taskId || task.value?.id
    if (!id) return
    const t = await api.getRiskTask(id)
    if (ticket === generation) {
      assertResultScope({ scope: t.input }, scope)
      task.value = t
      drawer.value = '任务详情'
    }
  })
}
function openReview() {
  if (!selected.value) return
  Object.assign(review, {
    opinion: selected.value.review?.opinion || '',
    reviewer: selected.value.review?.reviewer || options.value?.reviewers[0] || '',
    decision: 'confirm',
    level: selected.value.maximumSuggestedLevel,
    category: selected.value.primaryCategory,
  })
  drawer.value = '人工复核'
}
async function submitReview() {
  const id = result.value?.id,
    s = selected.value,
    ticket = generation
  if (!id || !s || !review.opinion.trim()) return
  await safely(async () => {
    await api.reviewRisk(id, s.id, s.revisionId, { ...review }, s.review?.id)
    const saved = await api.getRiskResult(id)
    if (ticket !== generation || result.value?.id !== id) return
    result.value = saved
    await loadRows()
    if (rows.value.some((r) => r.id === s.id)) await choose(s)
    emit('risk-updated')
  })
}
function openRule(rule: Rule, view = '规则详情') {
  activeRule.value = rule
  drawer.value = view
}
async function searchKnowledge() {
  const id = result.value?.id,
    sampleId = selected.value?.id,
    ticket = ++knowledgeGeneration
  if (!id || !sampleId) return
  await safely(async () => {
    const found = await api.searchRiskKnowledge(id, sampleId, keyword.value)
    if (
      ticket === knowledgeGeneration &&
      id === result.value?.id &&
      sampleId === selected.value?.id
    )
      knowledge.value = found
  })
}
function openKnowledge() {
  keyword.value = selected.value?.primaryCategory || ''
  drawer.value = '检索风险知识'
  void searchKnowledge()
}
async function download() {
  const id = result.value?.id
  if (!id) return
  await safely(async () => {
    const all = await api.exportRiskSamples(id, { ...query })
    const csv = [
      [
        '样本ID',
        '固定版本',
        '语种',
        '遮蔽正文',
        '主要类别',
        '原建议等级',
        '复核状态',
        '人工结论',
        '人工等级',
        '人工类别',
        '复核意见',
      ],
      ...all.map((s) => [
        s.id,
        s.versionId,
        languageName(s.language),
        s.text,
        s.primaryCategory,
        s.maximumSuggestedLevel,
        s.status,
        s.review?.decision || '',
        s.review?.level || '',
        s.review?.category || '',
        s.review?.opinion || '',
      ]),
    ]
      .map((row) =>
        row
          .map(
            (v) =>
              `"${String(v)
                .replace(/^[\s]*[=+@-]/, "'$&")
                .replaceAll('"', '""')}"`,
          )
          .join(','),
      )
      .join('\r\n')
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `风险样本-${id}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  })
}
onMounted(() =>
  safely(async () => {
    options.value = await api.getRiskOptions()
    Object.assign(scope, options.value.defaultScope)
    query.pageSize = options.value.pageSizes[0]!
    await loadScope()
  }),
)
onBeforeUnmount(() => {
  ++generation
  ++listGeneration
  clearSelection()
  clearTimeout(timer)
})
</script>
<template>
  <div v-loading="loading" class="risk-page">
    <div class="risk-heading">
      <div></div>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <PanelCard title="检测范围与结果" icon="Filter">
      <div class="risk-controls">
        <label
          >数据集<el-select v-model="scope.datasetId" :disabled="busy" @change="changeDataset"
            ><el-option
              v-for="d in options?.datasets"
              :key="d.id"
              :value="d.id"
              :label="d.name" /></el-select
        ></label>
        <label
          >固定版本<el-select v-model="scope.versionId" :disabled="busy" @change="changeVersion"
            ><el-option
              v-for="v in dataset?.versions"
              :key="v.id"
              :value="v.id"
              :label="v.id" /></el-select
        ></label>
        <label
          >语种<el-select v-model="scope.language" :disabled="busy || isGovernanceLlm" @change="loadScope"
            ><el-option label="全部语种" value="all" /><el-option
              v-for="l in version?.languages"
              :key="l"
              :value="l"
              :label="languageName(l)" /></el-select
        ></label>
        <label
          >分级方案<el-select v-model="scope.schemeId" :disabled="busy" @change="loadScope"
            ><el-option
              v-for="s in options?.schemes"
              :key="s.id"
              :value="s.id"
              :label="s.name" /></el-select
        ></label>
        <el-button
          type="primary"
          :disabled="busy || task?.status === 'running' || !options?.actions.includes('detect')"
          @click="start"
          >{{ result ? '重新检测' : '开始检测' }}</el-button
        ><el-button :disabled="busy || !options?.actions.includes('history')" @click="openHistory"
          >历史结果</el-button
        >
      </div>
      <div v-if="result" class="risk-identity">
        <span
          >{{ result.scope.versionId }} · {{ languageName(result.scope.language) }} ·
          {{ result.status }} · 有效检测 {{ result.validCount.toLocaleString() }} 条 ·
          {{ result.finishedAt }}</span
        ><el-button
          link
          type="primary"
          :disabled="!result.actions.includes('viewTask')"
          @click="openTask"
          >查看任务 ›</el-button
        >
      </div>
      <div v-if="result" class="risk-metrics">
        <button :class="{ active: !query.level && !query.status }" @click="filter()">
          <span>当前风险候选</span
          ><strong>{{ result.riskCount.toLocaleString() }}<small>条</small></strong>
        </button>
        <div>
          <span>风险占比</span><strong>{{ result.ratio.toFixed(1) }}<small>%</small></strong>
        </div>
        <button :class="{ active: query.level === 'HIGH' }" @click="filter('HIGH')">
          <span>高风险样本</span
          ><strong class="danger">{{ result.highCount.toLocaleString() }}<small>条</small></strong>
        </button>
        <button :class="{ active: query.status === '待复核' }" @click="filter('', '待复核')">
          <span>待人工复核</span
          ><strong>{{ result.pendingCount.toLocaleString() }}<small>条</small></strong>
        </button>
      </div>
      <p v-if="result" class="risk-note">
        已复核 {{ result.reviewedCount }} · 无法判断 {{ result.unassessableCount }} · 检测失败
        {{ result.failedCount }}。等级为原检测建议，未复核不等于确认违法。
      </p>
      <el-alert
        v-if="result && !result.riskCount"
        :title="
          result.validCount
            ? '本方案未检出风险，不代表绝对安全；无法判断与检测失败记录不计为安全。'
            : '当前范围没有有效检测样本，不能据此判断风险。'
        "
        type="info"
        :closable="false"
      />
      <template v-if="!result && task"
        ><el-alert
          :title="
            task.status === 'failed'
              ? `检测失败：${task.errorMessage || '查看任务详情'}`
              : '任务处理中，等待服务端保存检测结果'
          "
          :type="task.status === 'failed' ? 'error' : 'info'"
          :closable="false"
        /><el-button link @click="openTask">查看任务</el-button></template
      >
      <el-empty
        v-if="!result && !task"
        description="当前条件尚无保存结果，请开始检测"
        :image-size="60"
      />
    </PanelCard>
    <div v-if="result" class="risk-columns">
      <PanelCard title="风险等级分布" icon="PieChart"
        ><template #extra
          ><el-button class="panel-more" link type="primary" @click="drawer = '分级标准'"
            >分级标准 ›</el-button
          ></template
        >
        <RiskChart :result="result" :selected="query.level" @select="filter($event)" />
        <p class="risk-note">
          每条样本按最高建议等级计数。点击分段或图例筛选列表，清空其他筛选；百分比四舍五入，以条数为准。
        </p>
        <el-button class="risk-all-link" link type="primary" @click="filter()">查看全部风险候选</el-button>
      </PanelCard>
      <PanelCard title="风险样本明细" icon="List"
        ><template #extra
          ><el-button
            class="panel-more"
            link
            type="primary"
            :disabled="busy || !result.actions.includes('export')"
            @click="download"
            >导出全部匹配记录 ›</el-button
          ></template
        >
        <div class="risk-table-tools">
          <el-input
            v-model="query.keyword"
            placeholder="搜索样本 ID、正文或类别"
            clearable
            @keyup.enter="search"
            @clear="search"
          /><el-button @click="search">搜索</el-button
          ><el-select v-model="query.status" placeholder="复核状态" clearable @change="search"
            ><el-option v-for="s in options?.reviewStatuses" :key="s" :label="s" :value="s"
          /></el-select>
        </div>
        <div class="risk-filter">
          <span
            >{{ label(query.level) || '全部等级' }} · {{ query.status || '全部状态' }} · 匹配
            {{ total }} 条</span
          ><el-button link @click="filter()">重置筛选</el-button>
        </div>
        <el-table
          :data="rows"
          row-key="id"
          highlight-current-row
          :current-row-key="selected?.id"
          empty-text="当前条件无匹配风险候选"
          @row-click="choose"
          @sort-change="sortRows"
        >
          <el-table-column prop="id" label="样本 ID" min-width="150" />
          <el-table-column prop="text" label="内容摘要" min-width="180" show-overflow-tooltip />
          <el-table-column label="主要类别" min-width="122"
            ><template #default="{ row }"
              >{{ row.primaryCategory
              }}<el-tag v-if="extraCategories(row) > 0" size="small"
                >+{{ extraCategories(row) }}</el-tag
              ></template
            ></el-table-column
          >
          <el-table-column
            prop="maximumSuggestedLevel"
            label="建议等级"
            width="110"
            sortable="custom"
            ><template #default="{ row }"
              ><span class="risk-level" :style="{ color: color(row.maximumSuggestedLevel) }"
                >● {{ label(row.maximumSuggestedLevel) }}</span
              ></template
            ></el-table-column
          >
          <el-table-column prop="status" label="复核状态" width="110" sortable="custom" />
          <el-table-column label="操作" width="86"
            ><template #default="{ row }"
              ><el-button
                link
                type="primary"
                @click.stop="
                  choose(row).then(() => {
                    if (selected?.id === row.id) drawer = '完整依据'
                  })
                "
                >查看依据</el-button
              ></template
            ></el-table-column
          >
        </el-table>
        <div class="risk-pagination">
          <el-pagination
            v-model:current-page="query.page"
            v-model:page-size="query.pageSize"
            :page-sizes="options?.pageSizes"
            :total="total"
            layout="prev, pager, next, sizes"
            @current-change="loadRows"
            @size-change="search"
          />
        </div>
        <p class="risk-note">样本标识与数据资源一致；详情及关联知识随选中行联动。</p>
      </PanelCard>
      <PanelCard title="判定依据" icon="Shield"
        ><template #extra
          ><el-button
            class="panel-more"
            link
            type="primary"
            :disabled="!selected"
            @click="drawer = '完整依据'"
            >完整依据 ›</el-button
          ></template
        >
        <template v-if="selected"
          ><div class="risk-selected">
            <b>{{ selected.id }}</b
            ><el-tag :color="color(selected.maximumSuggestedLevel)" effect="dark">{{
              label(selected.maximumSuggestedLevel)
            }}</el-tag>
          </div>
          <p class="risk-note">原检测建议 · {{ selected.primaryCategory }}</p>
          <blockquote v-for="e in selected.evidence" :key="e.id">{{ e.quote }}</blockquote>
          <div v-for="f in selected.findings" :key="f.ruleId" class="risk-reason">
            <b>{{ f.category }}</b>
            <p>{{ f.reason }}</p>
            <el-button
              link
              type="primary"
              @click="
                openRule(
                  selected!.rules.find((r) => r.id === f.ruleId && r.version === f.ruleVersion)!,
                )
              "
              >{{ f.ruleId }} · v{{ f.ruleVersion }} ›</el-button
            >
          </div>
          <div class="risk-conclusion">
            <b>人工结论 · {{ selected.status }}</b>
            <p>
              {{
                selected.review?.decision === 'exclude'
                  ? '已排除误报'
                  : selected.review?.status === '已复核'
                    ? `${selected.review.category} / ${label(selected.review.level)}`
                    : '尚无人工结论'
              }}
            </p>
          </div>
          <div class="risk-evidence-actions">
            <el-button
              type="primary"
              :disabled="
                busy || !selected.actions.some((a) => ['viewReview', 'createReview'].includes(a))
              "
              @click="openReview"
              v-if="!isGovernanceLlm">{{ selected.review ? '查看复核' : '发起复核' }}</el-button
            ><el-button @click="drawer = '原始样本（只读）'">原始样本</el-button>
          </div> </template
        ><el-empty v-else description="选择样本查看已保存证据" :image-size="60" />
      </PanelCard>
    </div>
    <PanelCard v-if="result" title="关联风险知识" icon="Collection"
      ><template #extra
        ><el-button
          class="panel-more"
          link
          type="primary"
          :disabled="!selected"
          @click="openKnowledge"
          >检索知识库 ›</el-button
        ></template
      >
      <p class="risk-note">
        仅展示当前样本命中的规则版本及关联案例，供核查适用性。查看知识不会再次检测或修改样本。
      </p>
      <div v-if="selected" class="risk-knowledge">
        <article v-for="r in selected.rules" :key="`${r.id}:${r.version}`">
          <div class="risk-rule-icon">§</div>
          <div>
            <h3>{{ r.name }}</h3>
            <p>{{ r.id }} · v{{ r.version }} · {{ r.category }}</p>
            <p>{{ r.conditions }}</p>
          </div>
          <div class="risk-knowledge-actions">
            <el-button link type="primary" @click="openRule(r)">查看规则 ›</el-button
            ><el-button link type="primary" @click="openRule(r, '关联案例')">关联案例 ›</el-button>
          </div>
        </article>
      </div>
      <el-empty v-else description="选择风险样本后展示命中知识" :image-size="45" />
    </PanelCard>
    <el-drawer :model-value="!!drawer" :title="drawer" size="min(700px, 94vw)" @close="drawer = ''">
      <template v-if="drawer === '分级标准'"
        ><h3>{{ scheme?.name }}</h3>
        <p v-for="l in scheme?.levels" :key="l.level">
          <b :style="{ color: l.color }">{{ l.label }}</b
          >：{{ l.definition }}
        </p>
        <p>
          等级由规则和内容证据决定，不按模型自报概率判断。空 findings
          仅代表本方案未检出风险，不代表绝对安全；无法判断须保存原因。
        </p></template
      >
      <template v-else-if="drawer === '历史结果'"
        ><el-table :data="history" empty-text="当前固定条件无历史结果"
          ><el-table-column prop="finishedAt" label="完成时间" min-width="190" /><el-table-column
            prop="riskCount"
            label="风险候选"
          /><el-table-column label="操作"
            ><template #default="{ row }"
              ><el-button link @click="useHistory(row)">查看结果</el-button></template
            ></el-table-column
          ></el-table
        ></template
      >
      <template v-else-if="drawer === '任务详情'"
        ><el-descriptions :column="1" border
          ><el-descriptions-item label="任务 ID">{{ task?.id }}</el-descriptions-item
          ><el-descriptions-item label="状态">{{
            task && TASK_STATUS[task.status].label
          }}</el-descriptions-item
          ><el-descriptions-item label="数据集">{{
            options?.datasets.find((d) => d.id === task?.input.datasetId)?.name
          }}</el-descriptions-item>
          <el-descriptions-item label="固定版本">{{ task?.input.versionId }}</el-descriptions-item>
          <el-descriptions-item label="语种">{{
            languageName(task?.input.language || '')
          }}</el-descriptions-item>
          <el-descriptions-item label="分级方案">{{
            options?.schemes.find((s) => s.id === task?.input.schemeId)?.name
          }}</el-descriptions-item
          ><el-descriptions-item label="创建时间">{{ task?.createdAt }}</el-descriptions-item
          ><el-descriptions-item label="结果 ID">{{
            task?.resultId || '尚未生成'
          }}</el-descriptions-item
          ><el-descriptions-item v-if="task?.errorMessage" label="失败原因">{{
            task.errorMessage
          }}</el-descriptions-item></el-descriptions
        ></template
      >
      <template v-else-if="drawer === '规则详情' && activeRule"
        ><h3>{{ activeRule.name }}</h3>
        <p>{{ activeRule.id }} · v{{ activeRule.version }}</p>
        <h4>规则原文</h4>
        <p>{{ activeRule.text }}</p>
        <h4>适用条件</h4>
        <p>{{ activeRule.conditions }}</p>
        <h4>来源</h4>
        <p>{{ activeRule.source }}</p>
        <h4>当前样本匹配片段</h4>
        <template
          v-for="f in selected?.findings.filter(
            (f) => f.ruleId === activeRule?.id && f.ruleVersion === activeRule?.version,
          )"
          :key="f.ruleId"
          ><blockquote
            v-for="e in selected?.evidence.filter((e) => f.evidenceRefs.includes(e.id))"
            :key="e.id"
          >
            {{ e.quote }}
            <p>{{ e.feature }}</p>
          </blockquote></template
        ></template
      >
      <template v-else-if="drawer === '关联案例'"
        ><p>{{ activeRule?.id }} · v{{ activeRule?.version }} 对应案例</p>
        <article v-for="c in relatedCases" :key="c.id">
          <h3>{{ c.title }}</h3>
          <p>{{ c.text }}</p>
        </article>
        <el-empty v-if="!relatedCases?.length" description="此规则版本暂无关联案例"
      /></template>
      <template v-else-if="drawer === '检索风险知识'"
        ><el-input
          v-model="keyword"
          placeholder="按当前类别检索"
          @keyup.enter="searchKnowledge" /><el-button :loading="busy" @click="searchKnowledge"
          >检索</el-button
        >
        <p class="risk-note">检索范围绑定当前样本命中的规则及版本。</p>
        <p v-for="r in knowledge" :key="r.id">
          <el-button link type="primary" @click="openRule(r)"
            >{{ r.id }} · v{{ r.version }} · {{ r.name }}</el-button
          >
        </p>
        <el-empty v-if="!knowledge.length" description="未找到匹配知识"
      /></template>
      <template v-else-if="selected">
        <el-descriptions :column="1" border
          ><el-descriptions-item label="样本 ID">{{ selected.id }}</el-descriptions-item
          ><el-descriptions-item label="固定版本 / 修订"
            >{{ selected.versionId }} / {{ selected.revisionId }}</el-descriptions-item
          ><el-descriptions-item label="语种">{{
            languageName(selected.language)
          }}</el-descriptions-item
          ><el-descriptions-item label="原文（敏感字段遮蔽）"
            ><p class="risk-original">{{ selected.text }}</p></el-descriptions-item
          ><el-descriptions-item label="原检测建议"
            >{{ selected.primaryCategory }} /
            {{ label(selected.maximumSuggestedLevel) }}</el-descriptions-item
          ></el-descriptions
        >
        <template v-if="drawer !== '原始样本（只读）'"
          ><h3>全部风险标签与保存证据</h3>
          <section v-for="f in selected.findings" :key="f.ruleId">
            <h4>{{ f.category }} · {{ label(f.suggestedLevel) }}</h4>
            <p>{{ f.reason }}</p>
            <p>{{ f.ruleId }} · v{{ f.ruleVersion }}</p>
            <blockquote
              v-for="e in selected.evidence.filter((e) => f.evidenceRefs.includes(e.id))"
              :key="e.id"
            >
              {{ e.quote }}
              <p>{{ e.feature }} · {{ e.id }}</p>
            </blockquote>
          </section>
          <h3>人工复核（独立记录）</h3>
          <p>状态：{{ selected.status }} · 工单：{{ selected.review?.id || '尚未创建' }}</p>
          <template v-if="selected.review"
            ><p>复核人：{{ selected.review.reviewer }} · {{ selected.review.updatedAt }}</p>
            <p>
              结论：{{
                options?.reviewDecisions.find((d) => d.value === selected?.review?.decision)
                  ?.label || '尚无结论'
              }}
              {{ label(selected.review.level) }} {{ selected.review.category }}
            </p>
            <p>意见：{{ selected.review.opinion || '尚未填写' }}</p></template
          ></template
        >
        <el-form
          v-if="drawer === '人工复核' && (!selected.review || selected.review.actions.length)"
          label-position="top"
          class="risk-review-form"
          @submit.prevent="submitReview"
        >
          <el-form-item v-if="selected.review" label="人工决定"
            ><el-radio-group v-model="review.decision"
              ><el-radio
                v-for="d in options?.reviewDecisions.filter((d) =>
                  selected?.review?.actions.includes(d.value),
                )"
                :key="d.value"
                :value="d.value"
                >{{ d.label }}</el-radio
              ></el-radio-group
            ></el-form-item
          >
          <template v-if="selected.review && review.decision === 'adjust'"
            ><el-form-item label="人工等级"
              ><el-select v-model="review.level"
                ><el-option
                  v-for="l in scheme?.levels"
                  :key="l.level"
                  :value="l.level"
                  :label="l.label" /></el-select></el-form-item
            ><el-form-item label="人工类别"
              ><el-select v-model="review.category"
                ><el-option
                  v-for="c in options?.categories"
                  :key="c"
                  :value="c"
                  :label="c" /></el-select></el-form-item
          ></template>
          <el-form-item label="复核人"
            ><el-select v-model="review.reviewer"
              ><el-option
                v-for="r in options?.reviewers"
                :key="r"
                :value="r"
                :label="r" /></el-select></el-form-item
          ><el-form-item label="复核意见（必填）" required
            ><el-input
              v-model="review.opinion"
              type="textarea"
              :rows="4"
              placeholder="请说明核查依据与结论理由"
          /></el-form-item>
          <p class="risk-note">保留原始类别、等级与证据；不改写原样本，不改变原建议等级图。</p>
          <el-button
            native-type="submit"
            type="primary"
            :loading="busy"
            :disabled="!review.opinion.trim() || !review.reviewer"
            v-if="!isGovernanceLlm">{{ selected.review ? '提交人工结论' : '创建复核工单' }}</el-button
          >
        </el-form>
      </template>
    </el-drawer>
  </div>
</template>
<style scoped>
.risk-page {
  display: flex;
  flex-direction: column;
  gap: 15px;
  padding-bottom: 20px;
  color: #214573;
}
.risk-heading {
  display: none;
  justify-content: space-between;
  align-items: center;
}
.risk-heading h2 {
  margin: 0 0 5px;
  font-size: 20px;
  color: #13396f;
}
.risk-heading p {
  margin: 0;
  font-size: 13px;
  color: #788da9;
}
.risk-controls {
  display: flex;
  gap: 12px;
  font-size: 16px;
  flex-wrap: wrap;
  align-items: end;
}
.risk-controls label {
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: 16px;
  font-weight: 700;
  color: #6682a5;
}
/* 右侧风险等级标签文字 */
.risk-selected :deep(.el-tag__content) {
  font-size: 16px !important;
}
.risk-all-link {
  font-size: 16px; /* 文字大小 */
  margin-top: 5px; /* 与上方内容的距离 */
}
.risk-controls .el-select {
  width: 155px;
}
.risk-controls label:first-child .el-select,
.risk-controls label:nth-child(4) .el-select {
  width: 220px;
}
.risk-identity {
  margin-top: 16px;
  padding: 9px 12px;
  background: #f0f7ff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 16px;
  gap: 12px;
  flex-wrap: wrap;
}
.risk-identity .el-button {
  font-size: 16px;
}
.risk-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-top: 14px;
}
.risk-metrics > * {
  padding: 15px 20px;
  background: #f4f8fe;
  border: 1px solid #e7effb;
  border-radius: 7px;
  color: #587398;
  text-align: left;
  font: inherit;
}
.risk-metrics button {
  cursor: pointer;
}
.risk-metrics .active {
  border-color: #78b3ff;
  background: #eef6ff;
}
.risk-metrics span {
  font-size: 16px;
  font-weight: 700;
}
.risk-metrics strong {
  display: block;
  color: #113d7c;
  font-size: 28px;
  margin-top: 5px;
}
.risk-metrics small {
  font-size: 16px;
  font-weight: 700;
  margin-left: 7px;
}
.risk-metrics .danger {
  color: #e75269;
}
.risk-columns {
  display: grid;
  grid-template-columns: minmax(225px, 0.75fr) minmax(450px, 1.9fr) minmax(275px, 1fr);
  gap: 14px;
  align-items: stretch;
}
.risk-columns > * {
  min-width: 0;
}
.risk-note {
  font-size: 16px;
  font-weight: 700;
  color: #8191a9;
  line-height: 1.8;
  margin: 10px 0 0;
}
.risk-table-tools {
  display: flex;
  gap: 8px;
}
.risk-table-tools .el-select {
  width: 130px;
  flex-shrink: 0;
}
.risk-table-tools .el-input {
  flex: 1;
}
/* 表格表头文字 */
.risk-columns :deep(.el-table__header-wrapper th.el-table__cell .cell) {
  font-size: 15px;
  font-weight: 700;
}
/* 搜索输入框文字和占位文字 */
.risk-table-tools :deep(.el-input__inner) {
  font-size: 16px;
}

/* “搜索”按钮 */
.risk-table-tools .el-button {
  font-size: 16px;
}

/* “复核状态”下拉框 */
.risk-table-tools :deep(.el-select__placeholder),
.risk-table-tools :deep(.el-select__selected-item) {
  font-size: 16px;
}
.risk-filter {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 12px 0;
  font-size: 14px;
  color: #6d86a8;
}
.risk-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 18px;
  overflow-x: auto;
}
.risk-level {
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
}
.risk-selected {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
}
.risk-selected b {
  font-size: 16px;
  overflow-wrap: anywhere;
}
blockquote {
  margin: 14px 0;
  padding: 13px;
  background: #fff7eb;
  border-left: 3px solid #f3b96b;
  line-height: 1.8;
  font-size: 16px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.risk-reason {
  font-size: 16px;
  line-height: 1.8;
}
.risk-reason p {
  margin: 6px 0;
}
.risk-conclusion {
  margin: 14px 0;
  padding-top: 13px;
  border-top: 1px solid #e8eff9;
  font-size: 16px;
  line-height: 1.8;
}
.risk-conclusion p {
  color: #7b8da7;
}
.risk-evidence-actions {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
}
.risk-evidence-actions .el-button + .el-button {
  margin-left: 0;
  font-size: 16px;
  font-weight: 700;
}
.risk-knowledge {
  margin-top: 13px;
}
.risk-knowledge article {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 17px;
  border: 1px solid #dfebfc;
  border-radius: 8px;
  background: linear-gradient(120deg, #f7faff, #fff);
}
.risk-rule-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  background: #e3f3ff;
  color: #1687ff;
  border-radius: 14px;
  font-size: 28px;
}
.risk-knowledge h3 {
  margin: 0 0 7px;
  font-size: 16px;
}
.risk-knowledge-actions .el-button {
  margin: 0;
  font-size: 16px;
}
.risk-knowledge p {
  margin: 5px 0;
  color: #7a8faa;
  font-size: 16px;
}
.risk-knowledge-actions {
  display: flex;
  flex-direction: column;
  margin-left: auto;
  flex-shrink: 0;
  gap: 12px;
}
.risk-knowledge-actions .el-button {
  margin: 0;
}
.risk-original {
  white-space: pre-wrap;
}
.risk-review-form {
  margin-top: 20px;
}
@media (max-width: 1450px) {
  .risk-columns {
    grid-template-columns: minmax(240px, 0.8fr) minmax(450px, 1.8fr);
  }
  .risk-columns > :last-child {
    grid-column: 1 / -1;
  }
}
@media (max-width: 1050px) {
  .risk-columns {
    grid-template-columns: 1fr;
  }
  .risk-metrics {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
