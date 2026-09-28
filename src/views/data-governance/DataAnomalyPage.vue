<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import PanelCard from '../../components/PanelCard.vue'
import { languageName } from '../../utils/governance-language'
import { assertResultScope } from '../../utils/governance-scope'
import { TASK_STATUS } from '../../utils/enums'
import * as api from '../../api/data-anomaly'
import type {
  ChangeSet,
  Options,
  Query,
  Result,
  Sample,
  Scope,
  Task,
  VersionCheck,
  Published,
} from '../../types/data-anomaly'
const emit = defineEmits(['anomaly-updated'])
const options = ref<Options>()
const result = ref<Result | null>(null)
const selected = ref<Sample>()
const rows = ref<Sample[]>([])
const scope = reactive<Scope>({ datasetId: 3, versionId: '', language: 'zh', schemeId: '' })
const query = reactive<Query>({ page: 1, pageSize: 5, keyword: '', type: '', status: '' })
const total = ref(0),
  loading = ref(false),
  busy = ref(false),
  error = ref(''),
  drawer = ref(''),
  ruleSearch = ref('')
const statusSortOrder = ref<'ascending' | 'descending' | null>(null)
const task = ref<Task>()
const history = ref<Result[]>([])
const changeSet = ref<ChangeSet>()
const check = ref<VersionCheck>()
const published = ref<Published>()
const exportOpen = ref(false),
  confirmOpen = ref(false),
  repair = ref<HTMLElement>()
let generation = 0,
  listGeneration = 0,
  selectionGeneration = 0,
  timer: ReturnType<typeof setTimeout> | undefined
const dataset = computed(() => options.value?.datasets.find((d) => d.id === scope.datasetId))
const version = computed(() => dataset.value?.versions.find((v) => v.id === scope.versionId))
const candidate = computed(() => selected.value?.candidates.at(-1))
const rules = computed(() =>
  options.value?.rules.filter((r) => `${r.id}${r.name}${r.description}`.includes(ruleSearch.value)),
)
const metrics = computed(() =>
  result.value
    ? [
        { label: '当前异常', value: result.value.anomalyCount, status: '' },
        { label: '异常占比', value: `${result.value.ratio.toFixed(2)}%` },
        { label: '待处理', value: result.value.pendingCount, status: '待处理' },
        { label: '待复核', value: result.value.reviewCount, status: '待复核' },
      ]
    : [],
)
const snapshot = (): Scope => ({ ...scope })
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
  const ticket = ++selectionGeneration,
    id = result.value?.id
  selected.value = undefined
  if (!id) return
  try {
    const detail = await api.getAnomalySample(id, row.id)
    if (ticket === selectionGeneration && id === result.value?.id) selected.value = detail
  } catch (e) {
    if (ticket === selectionGeneration) error.value = String(e)
  }
}
async function loadRows() {
  const id = result.value?.id,
    ticket = ++listGeneration
  ++selectionGeneration
  rows.value = []
  selected.value = undefined
  if (!id) return
  try {
    let page
    if (statusSortOrder.value) {
      const pageSize = 100
      const first = await api.listAnomalySamples(id, { ...query, page: 1, pageSize })
      const remaining = await Promise.all(
        Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, index) =>
          api.listAnomalySamples(id, { ...query, page: index + 2, pageSize }),
        ),
      )
      const statusOrder: Record<string, number> = { 待处理: 0, 待复核: 1, 已处理: 2 }
      const direction = statusSortOrder.value === 'ascending' ? 1 : -1
      const items = [first, ...remaining]
        .flatMap((item) => item.items)
        .sort(
          (a, b) =>
            direction *
            ((statusOrder[a.status] ?? Number.MAX_SAFE_INTEGER) -
              (statusOrder[b.status] ?? Number.MAX_SAFE_INTEGER) ||
              a.id.localeCompare(b.id, 'zh-CN')),
        )
      const start = (query.page - 1) * query.pageSize
      page = { ...first, items: items.slice(start, start + query.pageSize), page: query.page }
    } else {
      page = await api.listAnomalySamples(id, { ...query })
    }
    if (ticket !== listGeneration || id !== result.value?.id) return
    rows.value = page.items
    total.value = page.total
    if (page.items[0]) await choose(page.items[0])
  } catch (e) {
    if (ticket === listGeneration) error.value = String(e)
  }
}
function changeStatusSort({
  prop,
  order,
}: {
  prop: string
  order: 'ascending' | 'descending' | null
}) {
  if (prop !== 'status') return
  statusSortOrder.value = order
  query.page = 1
  void loadRows()
}
async function loadScope() {
  const ticket = ++generation
  ++listGeneration
  ++selectionGeneration
  clearTimeout(timer)
  result.value = null
  selected.value = undefined
  rows.value = []
  total.value = 0
  task.value = undefined
  changeSet.value = undefined
  check.value = undefined
  published.value = undefined
  drawer.value = ''
  confirmOpen.value = false
  exportOpen.value = false
  Object.assign(query, { page: 1, keyword: '', type: '', status: '' })
  loading.value = true
  error.value = ''
  const input = snapshot()
  try {
    const [r, c] = await Promise.all([api.getLatestAnomaly(input), api.getAnomalyChangeSet(input)])
    if (ticket !== generation) return
    assertResultScope(r, input)
    result.value = r
    changeSet.value = c
    await loadRows()
  } catch (e) {
    if (ticket === generation) error.value = String(e)
  } finally {
    if (ticket === generation) loading.value = false
  }
}
function changeDataset() {
  scope.versionId = dataset.value?.versions[0]?.id || ''
  changeVersion()
}
function changeVersion() {
  scope.language = version.value?.languages[0]?.code || 'all'
  void loadScope()
}
function filter(status = '', type = query.type) {
  Object.assign(query, { status, type, keyword: '', page: 1 })
  void loadRows()
}
function searchRows() {
  query.page = 1
  void loadRows()
}
async function refresh(sampleId?: string) {
  const id = result.value?.id,
    ticket = generation
  if (!id) return
  const [r, c] = await Promise.all([api.getAnomalyResult(id), api.getAnomalyChangeSet(snapshot())])
  if (ticket !== generation) return
  result.value = r
  changeSet.value = c
  await loadRows()
  const row = rows.value.find((r) => r.id === sampleId)
  if (row) await choose(row)
  emit('anomaly-updated')
}
async function act(action: string) {
  const id = result.value?.id,
    row = selected.value
  if (!id || !row) return
  await safely(async () => {
    await api.updateCandidate(
      id,
      row.id,
      action,
      row.candidates.at(-1)?.candidateId,
      row.revisionId,
    )
    await refresh(row.id)
  })
}
async function start() {
  await safely(async () => {
    const ticket = generation
    const created = await api.startAnomaly(snapshot())
    if (ticket !== generation) return
    task.value = created
    result.value = null
    rows.value = []
    selected.value = undefined
    total.value = 0
    const taskId = task.value.taskId
    async function poll() {
      try {
        const t = await api.getAnomalyTask(taskId)
        if (ticket !== generation) return
        task.value = t
        if (t.status === 'running') timer = setTimeout(poll, 1000)
        else if (t.status === 'succeeded' && t.resultId) {
          const saved = await api.getAnomalyResult(t.resultId)
          if (ticket === generation) {
            assertResultScope(saved, scope)
            result.value = saved
            await loadRows()
            emit('anomaly-updated')
          }
        }
      } catch (e) {
        if (ticket === generation) error.value = String(e)
      }
    }
    timer = setTimeout(poll, 1000)
  })
}
async function openHistory() {
  await safely(async () => {
    const ticket = generation
    const saved = await api.getAnomalyHistory(snapshot())
    if (ticket !== generation) return
    history.value = saved
    drawer.value = '历史结果'
  })
}
async function openTask() {
  if (result.value)
    await safely(async () => {
      const ticket = generation
      const saved = await api.getAnomalyTask(result.value!.taskId)
      if (ticket !== generation) return
      assertResultScope({ scope: saved.input }, scope)
      task.value = saved
      drawer.value = '任务详情'
    })
}
async function selectHistory(r: Result) {
  await safely(async () => {
    const ticket = ++generation
    ++listGeneration
    ++selectionGeneration
    clearTimeout(timer)
    result.value = null
    task.value = undefined
    selected.value = undefined
    rows.value = []
    total.value = 0
    drawer.value = ''
    const saved = await api.getAnomalyResult(r.id)
    if (ticket !== generation) return
    assertResultScope(saved, scope)
    result.value = saved
    Object.assign(query, { page: 1, type: '', status: '', keyword: '' })
    await loadRows()
  })
}
async function preparePublish() {
  await safely(async () => {
    check.value = await api.checkAnomalyVersion(snapshot())
    confirmOpen.value = true
  })
}
async function publish() {
  if (!check.value) return
  await safely(async () => {
    published.value = await api.publishAnomalyVersion(snapshot(), check.value!.token)
    options.value = await api.getAnomalyOptions()
    confirmOpen.value = false
    changeSet.value = await api.getAnomalyChangeSet(snapshot())
    await refresh()
    ElMessage.success('已整批生成新版本，原版本保持不变')
  })
}
async function remove(candidateId: string) {
  await safely(async () => {
    changeSet.value = await api.removeAnomalyEntry(snapshot(), candidateId)
    check.value = undefined
  })
}
async function download() {
  if (!result.value) return
  const id = result.value.id,
    q = { ...query }
  await safely(async () => {
    const all = await api.exportAnomalySamples(id, q)
    const csv = [
      ['样本ID', '版本', '语种', '正文', '主要类型', '状态'],
      ...all.map((r) => [
        r.id,
        r.versionId,
        languageName(r.language),
        r.text,
        r.primaryType,
        r.status,
      ]),
    ]
      .map((row) =>
        row
          .map(
            (value) =>
              `"${String(value)
                .replace(/^[=+@-]/, "'$&")
                .replaceAll('"', '""')}"`,
          )
          .join(','),
      )
      .join('\r\n')
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `异常样本-${id}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    exportOpen.value = false
  })
}
onMounted(() =>
  safely(async () => {
    options.value = await api.getAnomalyOptions()
    if (!dataset.value) scope.datasetId = options.value.datasets[0]!.id
    scope.versionId = dataset.value!.versions[0]!.id
    scope.schemeId = options.value.schemes[0]!.id
    await loadScope()
  }),
)
onBeforeUnmount(() => {
  ++generation
  ++listGeneration
  ++selectionGeneration
  clearTimeout(timer)
})
watch(
  () => query.page,
  () => {
    void loadRows()
  },
)
</script>
<template>
  <div v-loading="loading" class="anomaly-page">
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <PanelCard title="当前数据集检测">
      <div class="anomaly-controls">
        <label
          >数据集<el-select v-model="scope.datasetId" :disabled="busy" @change="changeDataset"
            ><el-option
              v-for="d in options?.datasets"
              :key="d.id"
              :label="d.name"
              :value="d.id" /></el-select
        ></label>
        <label
          >版本<el-select v-model="scope.versionId" :disabled="busy" @change="changeVersion"
            ><el-option
              v-for="v in dataset?.versions"
              :key="v.id"
              :label="v.label"
              :value="v.id" /></el-select
        ></label>
        <label
          >语种<el-select v-model="scope.language" :disabled="busy" @change="loadScope"
            ><el-option label="全部语种" value="all" /><el-option
              v-for="l in version?.languages"
              :key="l.code"
              :label="l.name"
              :value="l.code" /></el-select
        ></label>
        <label
          >检测方案<el-select v-model="scope.schemeId" :disabled="busy" @change="loadScope"
            ><el-option
              v-for="s in options?.schemes"
              :key="s.id"
              :label="s.name"
              :value="s.id" /></el-select
        ></label>
        <el-button
          type="primary"
          :disabled="busy || !options || task?.status === 'running'"
          @click="start"
          >{{ result ? '重新检测' : '开始检测' }}</el-button
        ><el-button :disabled="busy" @click="openHistory">历史结果</el-button>
      </div>
      <div v-if="result" class="anomaly-result">
        <span
          >当前结果：{{ result.versionLabel }} · {{ languageName(result.scope.language) }} ·
          当前语种全量范围 · 有效检测 {{ result.validCount }} 条 · 已完成 ·
          {{ result.finishedAt }}</span
        ><el-button link type="primary" @click="openTask">查看任务 ›</el-button>
      </div>
      <el-alert
        v-else-if="task?.status === 'running'"
        title="检测任务运行中，正在等待保存结果"
        type="info"
        :closable="false"
      />
      <el-alert
        v-else-if="task?.status === 'failed'"
        :title="`检测失败：${task.errorMessage || '请查看任务详情'}`"
        type="error"
        :closable="false"
      />
      <el-empty
        v-else
        description="未分析：没有完全匹配的历史结果，点击开始检测创建任务"
        :image-size="60"
      />
      <el-button v-if="task && !result" link type="primary" @click="drawer = '任务详情'"
        >查看当前任务详情</el-button
      >
      <template v-if="result"
        ><div class="anomaly-metrics">
          <button
            v-for="m in metrics"
            :key="m.label"
            :disabled="m.status === undefined"
            @click="filter(m.status)"
          >
            <span>{{ m.label }}</span
            ><strong>{{ m.value }}</strong>
          </button>
        </div>
        <p class="anomaly-note">
          失败 {{ result.failedCount }} · 不可评估 {{ result.unavailableCount }} · 已处理
          {{ result.processedCount }}（具体处置见详情）
        </p>
        <el-alert
          v-if="!result.anomalyCount"
          :title="
            result.validCount
              ? '有效检测样本未发现异常；失败和不可评估不计为正常'
              : '没有可评估样本，不代表没有问题'
          "
          type="info"
          :closable="false"
      /></template>
    </PanelCard>
    <div v-if="result" class="anomaly-columns">
      <PanelCard title="异常类型分布"
        ><template #extra
          ><el-button class="panel-more" link type="primary" @click="drawer = '类型明细'"
            >类型明细 ›</el-button
          ></template
        ><button
          v-for="t in result.primaryTypeCounts"
          :key="t.type"
          class="anomaly-bar"
          :class="{ active: query.type === t.type }"
          @click="filter('', t.type)"
        >
          <span>{{ t.type }}</span>
          <div>
            <i
              :style="{
                width: `${result.anomalyCount ? (t.count / result.anomalyCount) * 100 : 0}%`,
              }"
            />
          </div>
          <b>{{ t.count }}</b>
        </button>
        <p class="anomaly-note">按唯一主要类型计数，点击筛选并清空状态和搜索。</p></PanelCard
      >
      <PanelCard title="选中样本：异常依据与来源"
        ><template #extra
          ><el-button
            class="panel-more"
            link
            type="primary"
            :disabled="!selected"
            @click="drawer = '完整详情'"
            >完整详情 ›</el-button
          ></template
        ><template v-if="selected"
          ><div class="anomaly-tags">
            <el-tag>{{ selected.id }}</el-tag
            ><el-tag type="danger">{{ selected.primaryType }}</el-tag
            ><el-tag type="warning">{{ selected.status }}</el-tag>
          </div>
          <p class="anomaly-excerpt">{{ selected.text }}</p>
          <p v-for="f in selected.findings" :key="f.ruleId" class="anomaly-finding">
            <b>发现问题：</b>{{ f.reason }}<br /><b>证据：</b>“{{ f.quote }}”
          </p>
          <div class="anomaly-source">
            数据集：{{ result.datasetName }}<br />版本：{{ selected.versionId }} · 样本：{{
              selected.id
            }}<br />原文件 / 行号：{{ selected.source.filename || '未记录' }} /
            {{ selected.source.line ?? '未记录' }}
          </div>
          <el-button link type="primary" @click="drawer = '原始样本'"
            >查看原始样本 ›</el-button
          ></template
        ><el-empty v-else description="请选择样本" :image-size="50"
      /></PanelCard>
    </div>
    <PanelCard v-if="result" title="异常样本明细"
      ><template #extra
        ><el-button class="anomaly-export-button" type="primary" plain @click="exportOpen = true"
          >导出当前列表</el-button
        ></template
      >
      <div class="anomaly-table-tools">
        <div>
          <el-button
            v-for="s in [
              { label: '全部', value: '', count: result.anomalyCount },
              { label: '待处理', value: '待处理', count: result.pendingCount },
              { label: '待复核', value: '待复核', count: result.reviewCount },
              { label: '已处理', value: '已处理', count: result.processedCount },
            ]"
            :key="s.label"
            :type="query.status === s.value ? 'primary' : 'default'"
            text
            @click="filter(s.value)"
            >{{ s.label }} {{ s.count }}</el-button
          >
        </div>
        <el-select v-model="query.type" clearable placeholder="全部类型" @change="searchRows"
          ><el-option v-for="t in options?.types" :key="t" :label="t" :value="t" /></el-select
        ><el-input
          v-model="query.keyword"
          clearable
          placeholder="样本ID或关键词"
          @input="searchRows"
        />
      </div>
      <el-table
        :data="rows"
        highlight-current-row
        row-key="id"
        :current-row-key="selected?.id"
        @sort-change="changeStatusSort"
        @row-click="choose"
        ><el-table-column prop="id" label="样本 ID" width="190" /><el-table-column
          prop="text"
          label="内容摘要"
          min-width="250"
          show-overflow-tooltip
        /><el-table-column prop="primaryType" label="主要异常" width="130" /><el-table-column
          prop="status"
          label="处理状态"
          width="120"
          sortable="custom"
        /><el-table-column label="操作" width="115"
          ><template #default="{ row }"
            ><el-button
              link
              type="primary"
              @click.stop="
                choose(row).then(() => {
                  if (row.status === '已处理') drawer = '处理时间线'
                  else repair?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                })
              "
              >{{ row.status === '已处理' ? '查看记录' : '查看建议' }}</el-button
            ></template
          ></el-table-column
        ></el-table
      >
      <div class="anomaly-pagination">
        <span>共 {{ total }} 条 · 当前显示 {{ rows.length }} 条</span
        ><el-pagination
          v-model:current-page="query.page"
          :page-size="query.pageSize"
          :total="total"
          layout="prev, pager, next"
        />
      </div>
    </PanelCard>
    <div v-if="result" ref="repair">
      <PanelCard :title="`修复建议${selected ? ' · ' + selected.id : ''}`"
        ><template v-if="selected && candidate"
          ><div class="anomaly-repair">
            <div>
              <b>原始字段</b>
              <p v-for="f in candidate.fieldChanges" :key="f.field" class="anomaly-field">
                {{ f.field }} = {{ f.before }}
              </p>
            </div>
            <div>
              <b>建议修改</b>
              <p v-for="f in candidate.fieldChanges" :key="f.field" class="anomaly-field proposed">
                {{ f.field }} = {{ f.after }}
              </p>
            </div>
            <div>
              <b>校验结果</b>
              <p v-for="v in candidate.validationResults" :key="v.name">
                {{ v.passed ? '✓' : '✕' }} {{ v.name }}
              </p>
              <el-tag :type="candidate.status === 'APPROVED' ? 'success' : 'warning'">{{
                candidate.status === 'DRAFT' || candidate.status === 'PENDING_REVIEW'
                  ? '内容复核待完成'
                  : candidate.status
              }}</el-tag>
            </div>
          </div>
          <p>{{ candidate.reason }}</p>
          <p class="anomaly-note">
            候选 {{ candidate.candidateId }}<br />输入修订 {{ candidate.inputSampleRevisionId
            }}<template v-if="candidate.replacesCandidateId"
              ><br />取代草稿 {{ candidate.replacesCandidateId }}</template
            >
          </p>
          <div class="anomaly-footer">
            <el-alert
              title="自动校验不等于人工审核。审核通过后加入修改集，由用户统一生成版本。"
              type="warning"
              :closable="false"
            /><el-button
              :disabled="busy || !selected.actions.includes('generate')"
              @click="act('generate')"
              >重新生成建议</el-button
            ><el-button
              type="primary"
              :disabled="busy || !selected.actions.includes('submit')"
              @click="act('submit')"
              >提交复核</el-button
            ><el-button link type="primary" @click="drawer = '处理时间线'">查看修复记录</el-button
            ><el-button
              v-if="selected.actions.includes('approve')"
              :disabled="busy"
              @click="drawer = '人工复核'"
              >人工复核</el-button
            >
          </div></template
        ><template v-else-if="selected"
          ><el-button
            :disabled="busy || !selected.actions.includes('generate')"
            @click="act('generate')"
            >生成建议</el-button
          ></template
        ><el-empty v-else description="选择样本查看字段级修复候选" :image-size="50"
      /></PanelCard>
    </div>
    <PanelCard title="待发布修改集"
      ><template v-if="changeSet"
        ><p class="change-set-title">
          {{ dataset?.name }} · 基础版本 <el-tag>{{ changeSet.versionLabel }}</el-tag>
        </p>
        <div class="anomaly-footer">
          <div class="anomaly-metrics set-metrics">
            <div>
              <span>已审核修改</span><strong>{{ changeSet.entries.length }} 条</strong>
            </div>
            <div>
              <span>冲突</span><strong>{{ changeSet.conflicts }} 条</strong>
            </div>
            <div>
              <span>最近更新</span><b>{{ changeSet.updatedAt }}</b>
            </div>
          </div>
          <el-button @click="drawer = '待发布修改集'">查看修改集</el-button
          ><el-button
            type="primary"
            :disabled="busy || !changeSet.actions.includes('publish')"
            @click="preparePublish"
            >生成新版本</el-button
          >
        </div>
        <p class="anomaly-note">
          多条审核通过的修改集中生成一个新版本，原版本内容和历史分析结果保持不变。
        </p>
        <el-alert
          v-if="published"
          :title="`已生成：${published.versionLabel}（${published.newDatasetVersionId}）`"
          type="success"
          :closable="false" /></template
    ></PanelCard>
    <el-drawer :model-value="!!drawer" :title="drawer" size="min(720px, 90vw)" @close="drawer = ''">
      <template v-if="drawer === '历史结果'"
        ><el-empty v-if="!history.length" description="无匹配历史结果" /><el-table :data="history"
          ><el-table-column prop="finishedAt" label="完成时间" /><el-table-column
            prop="anomalyCount"
            label="异常数"
          /><el-table-column label="操作"
            ><template #default="{ row }"
              ><el-button link @click="selectHistory(row)">查看结果</el-button></template
            ></el-table-column
          ></el-table
        ></template
      >
      <template v-else-if="drawer === '类型明细'"
        ><p>严重度优先、规则优先级次之；每个样本仅一个 primaryType，全部命中在详情展示。</p>
        <p v-for="t in result?.primaryTypeCounts" :key="t.type">{{ t.type }}：{{ t.count }}</p>
        <el-alert
          title="重复项应保留主记录并排除重复项；缺失来源仅标记待补充，不编造内容。基础方案不承诺投毒检测。"
          type="info"
          :closable="false" />
        <h3>方案规则（{{ options?.rules.length }} 项）</h3>
        <el-input v-model="ruleSearch" placeholder="查询规则名称或编号" clearable /><el-table
          :data="rules"
          ><el-table-column prop="id" label="编号" /><el-table-column
            prop="name"
            label="规则" /><el-table-column prop="description" label="说明" /></el-table
      ></template>
      <template v-else-if="drawer === '任务详情'"
        ><el-descriptions :column="1" border
          ><el-descriptions-item label="任务ID">{{ task?.taskId }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{
            task && TASK_STATUS[task.status].label
          }}</el-descriptions-item>
          <el-descriptions-item label="数据集">{{
            options?.datasets.find((d) => d.id === task?.input.datasetId)?.name
          }}</el-descriptions-item>
          <el-descriptions-item label="固定版本">{{ task?.input.versionId }}</el-descriptions-item>
          <el-descriptions-item label="语种">{{
            languageName(task?.input.language || '')
          }}</el-descriptions-item>
          <el-descriptions-item label="方案">{{ task?.ruleVersion }}</el-descriptions-item>
          <el-descriptions-item label="检测来源">{{ task?.modelVersion }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ task?.createdAt }}</el-descriptions-item>
          <el-descriptions-item label="结果ID">{{
            task?.resultId || '尚未生成'
          }}</el-descriptions-item>
          <el-descriptions-item v-if="task?.errorMessage" label="失败原因">{{
            task.errorMessage
          }}</el-descriptions-item></el-descriptions
        >
        <p>输入为固定数据版本与方案；详情仅读取已保存证据。</p></template
      >
      <template v-else-if="drawer === '待发布修改集'"
        ><p>基础版本：{{ changeSet?.versionLabel }} · 冲突 {{ changeSet?.conflicts }}</p>
        <el-table :data="changeSet?.entries"
          ><el-table-column prop="sampleId" label="样本" /><el-table-column label="修改"
            ><template #default="{ row }"
              ><p v-for="f in row.changes" :key="f.field">
                {{ f.field }}：{{ f.before }} → {{ f.after }}
              </p></template
            ></el-table-column
          ><el-table-column label="冲突"
            ><template #default="{ row }">{{ row.conflict || '无' }}</template></el-table-column
          ><el-table-column label="操作"
            ><template #default="{ row }"
              ><el-button link type="danger" :disabled="busy" @click="remove(row.candidateId)"
                >移除条目</el-button
              ></template
            ></el-table-column
          ></el-table
        >
        <p>已排除项：{{ changeSet?.excluded.join('、') || '无' }}</p></template
      >
      <template v-else-if="drawer === '处理时间线'"
        ><el-timeline
          ><el-timeline-item
            v-for="(event, index) in selected?.timeline"
            :key="index"
            :timestamp="event.at"
            >{{ event.message }}</el-timeline-item
          ></el-timeline
        >
        <h3>候选历史</h3>
        <p v-for="c in selected?.candidates" :key="c.candidateId">
          {{ c.candidateId }} · {{ c.status }}
        </p></template
      >
      <template v-else-if="drawer === '人工复核'"
        ><p>{{ selected?.text }}</p>
        <p>{{ candidate?.reason }}</p>
        <p v-for="f in candidate?.fieldChanges" :key="f.field">
          {{ f.field }}：{{ f.before }} → {{ f.after }}
        </p>
        <el-alert
          title="确认内容和证据后审核；通过仅加入修改集，不改写原数据。"
          type="warning"
          :closable="false"
        />
        <div class="anomaly-review">
          <el-button
            type="primary"
            :disabled="busy || !selected?.actions.includes('approve')"
            @click="act('approve').then(() => (drawer = ''))"
            >审核通过</el-button
          ><el-button
            :disabled="busy || !selected?.actions.includes('reject')"
            @click="act('reject').then(() => (drawer = ''))"
            >驳回</el-button
          ><el-button
            :disabled="busy || !selected?.actions.includes('withdraw')"
            @click="act('withdraw').then(() => (drawer = ''))"
            >撤回复核</el-button
          >
        </div></template
      >
      <template v-else-if="selected"
        ><el-descriptions :column="1" border
          ><el-descriptions-item label="样本ID">{{ selected.id }}</el-descriptions-item
          ><el-descriptions-item label="数据集 / 版本"
            >{{ selected.datasetId }} / {{ selected.versionId }}</el-descriptions-item
          ><el-descriptions-item label="语种">{{
            languageName(selected.language)
          }}</el-descriptions-item
          ><el-descriptions-item label="原始正文"
            ><p style="white-space: pre-wrap">{{ selected.text }}</p></el-descriptions-item
          ><el-descriptions-item label="元数据">{{ selected.metadata }}</el-descriptions-item
          ><el-descriptions-item label="原文件 / 行号"
            >{{ selected.source.filename || '未记录' }} /
            {{ selected.source.line ?? '未记录' }}</el-descriptions-item
          ><el-descriptions-item label="处置">{{
            selected.resolution || selected.status
          }}</el-descriptions-item></el-descriptions
        ><template v-if="drawer === '完整详情'"
          ><h3>全部命中依据</h3>
          <p v-for="f in selected.findings" :key="f.ruleId">
            {{ f.ruleId }} · {{ f.type }} · {{ f.field }}<br />{{ f.reason }}<br />原文引用：“{{
              f.quote
            }}”
          </p></template
        ><el-tooltip content="数据资源样本定位入口尚未接入，本抽屉提供只读原文"
          ><span><el-button disabled>跳转资源样本</el-button></span></el-tooltip
        ></template
      >
    </el-drawer>
    <el-dialog v-model="exportOpen" title="导出异常样本" width="500px"
      ><p>导出当前结果中全部匹配记录：{{ total }} 条，包含所有分页。</p>
      <p>
        状态：{{ query.status || '全部' }} · 类型：{{ query.type || '全部' }} · 搜索：{{
          query.keyword || '无'
        }}
      </p>
      <template #footer
        ><el-button @click="exportOpen = false">取消</el-button
        ><el-button type="primary" :loading="busy" @click="download">导出 CSV</el-button></template
      ></el-dialog
    >
    <el-dialog v-model="confirmOpen" title="校验并生成新版本" width="580px"
      ><template v-if="check"
        ><p>将应用 {{ check.count }} 条已审核修改 · 基础版本 {{ changeSet?.versionLabel }}</p>
        <p>被排除项：{{ check.excluded.join('、') || '无' }}</p>
        <p>{{ check.targetDescription }}</p>
        <el-alert
          :title="
            check.valid
              ? '全部条目校验通过；确认后由服务端再次校验并一次性生成'
              : '校验未通过，请在修改集中移除或解决冲突'
          "
          :type="check.valid ? 'success' : 'error'"
          :closable="false"
        />
        <p v-for="e in check.errors" :key="e">{{ e }}</p></template
      ><template #footer
        ><el-button @click="confirmOpen = false">取消</el-button
        ><el-button type="primary" :disabled="!check?.valid" :loading="busy" @click="publish"
          >确认生成新版本</el-button
        ></template
      ></el-dialog
    >
  </div>
</template>
<style scoped>
.anomaly-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-bottom: 24px;
  color: #193b6a;
}
.anomaly-controls,
.anomaly-table-tools,
.anomaly-footer {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.anomaly-controls label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
}
.anomaly-controls .el-select {
  width: 155px;
}
.anomaly-controls .el-button {
  font-size: 16px;
}
.anomaly-controls label:first-child .el-select {
  width: 230px;
}
.anomaly-result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #eaf5ff;
  padding: 10px 14px;
  margin: 16px 0;
  border-radius: 6px;
  font-size: 16px;
}
.anomaly-result .el-button {
  font-size: 16px;
}
/* “查看修改集”和“生成新版本” */
.set-metrics ~ .el-button {
  font-size: 16px;
  font-weight: 700;
}
.anomaly-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-top: 14px;
}
.anomaly-metrics > button,
.anomaly-metrics > div {
  border: 0;
  border-radius: 7px;
  background: linear-gradient(110deg, #eef7ff, #f4faff);
  padding: 16px 20px;
  text-align: left;
  color: #173c70;
}
.anomaly-metrics > button:not(:disabled) {
  cursor: pointer;
}
.anomaly-metrics span {
  display: block;
  font-size: 16px;
  font-weight: 700;
}
.anomaly-metrics strong {
  display: block;
  font-size: 20px;
  margin-top: 8px;
  color: #05296a;
}
.anomaly-finding {
  font-size: 15px;
  line-height: 1.6;
}
.anomaly-columns {
  display: grid;
  grid-template-columns: 1fr 1.15fr;
  gap: 14px;
}
.anomaly-bar {
  display: flex;
  width: 100%;
  gap: 12px;
  align-items: center;
  border: 0;
  background: transparent;
  padding: 13px 0;
  color: #23426c;
  cursor: pointer;
}
.anomaly-bar > span {
  width: 70px;
  text-align: left;
  font-size: 16px;
}
.anomaly-bar > b {
  font-size: 16px;
}
.anomaly-bar > div {
  flex: 1;
  height: 18px;
  background: #eff5fc;
}
.anomaly-bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #69a4ff, #307cff);
}
.anomaly-bar.active {
  color: #0067ff;
  font-weight: 700;
}
.anomaly-bar b {
  width: 32px;
  text-align: left;
}
/* “跨文化交流多语种数据集 · 基础版本” */
.change-set-title {
  font-size: 18px;
  margin-top: 0;
  margin-bottom: 10px; /* 控制与下方卡片的距离 */
}
/* dsv_000003 标签文字 */
.change-set-title :deep(.el-tag__content) {
  font-size: 16px;
}
.anomaly-export-button {
  font-size: 16px;
}
.anomaly-note {
  font-size: 12px;
  color: #70819a;
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.anomaly-tags {
  display: flex;
  gap: 8px;
}
.anomaly-tags :deep(.el-tag__content) {
  font-size: 14px;
}
.anomaly-excerpt {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.9;
}
.anomaly-source {
  border-top: 1px solid #e0e9f3;
  padding-top: 10px;
  font-size: 14px;
  line-height: 1.8;
}
.anomaly-table-tools {
  margin-bottom: 12px;
}
.anomaly-table-tools .el-select {
  width: 140px;
  margin-left: auto;
}
.anomaly-table-tools .el-input {
  width: 210px;
}
.anomaly-table-tools .el-button {
  font-size: 16px;
  font-weight: 700;
}
.anomaly-table-tools :deep(.el-select__selected-item),
.anomaly-table-tools :deep(.el-select__placeholder) {
  font-size: 16px;
}
.anomaly-table-tools :deep(.el-input__inner) {
  font-size: 16px;
}
.anomaly-page :deep(.el-table__header-wrapper th.el-table__cell .cell) {
  font-size: 16px;
  font-weight: 700;
}
.anomaly-pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 14px;
  font-size: 12px;
}
/* “原始字段 / 建议修改 / 校验结果” */
.anomaly-repair {
  font-size: 16px;
}

/* 三个小标题 */
.anomaly-repair b {
  font-size: 18px;
}

/* 字段内容和校验结果 */
.anomaly-repair p {
  font-size: 16px;
}

/* 下方说明文字 */
.anomaly-note {
  font-size: 16px; /* 当前是 12px */
}
.anomaly-repair {
  display: grid;
  grid-template-columns: 1fr 1fr 1.1fr;
  gap: 18px;
}
.anomaly-repair > div {
  border-right: 1px solid #e3ebf5;
  padding-right: 16px;
}
.anomaly-field {
  padding: 10px;
  background: #f0f2f5;
  border-radius: 4px;
}
.anomaly-field.proposed {
  background: #e3f1ff;
  color: #0067ff;
}
.anomaly-footer > .el-alert {
  flex: 1;
  min-width: 240px;
}
.set-metrics {
  grid-template-columns: 1fr 1fr 1.7fr;
  flex: 1;
  min-width: 430px;
  margin: 0;
}
.set-metrics b {
  display: block;
  font-size: 20px;
  margin-top: 10px;
}
.anomaly-review {
  margin-top: 20px;
}
@media (max-width: 1100px) {
  .anomaly-columns {
    grid-template-columns: 1fr;
  }
  .anomaly-repair {
    grid-template-columns: 1fr;
  }
  .anomaly-metrics {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
