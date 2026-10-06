<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PanelCard from '../../components/PanelCard.vue'
import StateBadge from './components/StateBadge.vue'
import { complianceApi } from '../../api/compliance'
import { request } from '../../api/request'
import { describeError, isNotFound, useComplianceStore } from '../../stores/compliance'
import { demoTraceEvidences, demoTraceTasks } from '../../mock/compliance'
import { getTaskCategory, TASK_STATUS } from '../../utils/enums'
import { formatTime } from './presentation'
import type { Evidence } from '../../types/compliance'
/**
 * 「全链路追踪」按任务角度筛查五要素：
 * 选一个任务，核验它的输入 / 时间 / 接口 / 版本 / 输出是否都已留痕。
 * 横向上游关系属于「数据谱系追踪」；单条证据的原始字段属于「源证据详情」抽屉。
 */
/** 任务列表里本页用到的字段（GET /tasks 的返回字段）。 */
interface TaskItem {
  taskId: string
  name: string
  capabilityCode: string
  status: string
  createdAt: string
  finishedAt: string | null
  datasetName: string | null
  datasetVersion: string | null
}
/** 任务类别名统一取自 utils/enums.ts 的 TASK_CATEGORY。 */
const categoryOf = (code: string) => getTaskCategory(code)
/** 五要素的固定顺序与默认名称，与后端生成证据时使用的 key 一致。 */
const ELEMENT_KEYS = ['input', 'time', 'interface', 'version', 'output'] as const
const ELEMENT_LABELS: Record<string, string> = {
  input: '输入',
  time: '时间',
  interface: '接口',
  version: '版本',
  output: '输出',
}
/**
 * 证据编号约定：数据治理任务沿用后端已有的 evidence-process-{task_id}；
 * 其余任务类型约定为 evidence-task-{task_id}，需后端按同一口径补齐五要素证据。
 */
const evidenceIdOf = (task: TaskItem) =>
  task.capabilityCode === 'data_process'
    ? `evidence-process-${task.taskId}`
    : `evidence-task-${task.taskId}`
const store = useComplianceStore()
const tasks = ref<TaskItem[]>([]),
  category = ref(''),
  taskId = ref(''),
  evidence = ref<Evidence | null>(null),
  evidenceId = ref(''),
  loading = ref(false),
  loadError = ref('')
const statusLabel = (state: string) =>
  TASK_STATUS[state as keyof typeof TASK_STATUS]?.label ?? state
const statusColor = (state: string) =>
  TASK_STATUS[state as keyof typeof TASK_STATUS]?.color ?? 'info'
/** 任务类别选项：从实际任务里归纳，只列出确实有任务的类别。 */
const categoryOptions = computed(() => {
  const counter = new Map<string, number>()
  tasks.value.forEach((task) => {
    const label = categoryOf(task.capabilityCode)
    counter.set(label, (counter.get(label) ?? 0) + 1)
  })
  return [...counter.entries()].map(([label, count]) => ({ label, count }))
})
/** 「任务记录」下拉：当前类别下的全部任务。 */
const taskOptions = computed(() =>
  tasks.value.filter((task) => categoryOf(task.capabilityCode) === category.value),
)
const selected = computed(() => tasks.value.find((task) => task.taskId === taskId.value) ?? null)
/** 五要素：按固定顺序取证据里的字段，缺项标为未记录。 */
const elements = computed(() =>
  ELEMENT_KEYS.map((key) => {
    const field = (evidence.value?.redactedFields ?? []).find((item) => item.key === key)
    return {
      key,
      label: field?.label ?? ELEMENT_LABELS[key] ?? key,
      value: field?.value ?? null,
      state: field?.state ?? ('unknown' as const),
    }
  }),
)
/** 待补证数量：只有确实取到证据时才统计，避免"未登记证据"被误写成"N 项待补证"。 */
const pendingCount = computed(() =>
  evidence.value ? elements.value.filter((item) => item.state === 'missing').length : 0,
)
async function loadTasks() {
  // 示例演示模式：使用演示任务列表，不连后端。
  if (store.demo) {
    tasks.value = demoTraceTasks
    return
  }
  try {
    // 后端 /tasks 的 page_size 上限为 100（back/app/routers/tasks.py:276），任务多于一页时逐页取回。
    const first = await request<{ items: TaskItem[]; total: number }>({
      url: '/tasks',
      params: { page: 1, pageSize: 100 },
    })
    const all = [...(first.items ?? [])]
    const pages = Math.ceil((first.total ?? all.length) / 100)
    for (let page = 2; page <= pages; page += 1) {
      const next = await request<{ items: TaskItem[] }>({
        url: '/tasks',
        params: { page, pageSize: 100 },
      })
      all.push(...(next.items ?? []))
    }
    tasks.value = all
  } catch (exception) {
    loadError.value = `任务列表加载失败：${describeError(exception)}`
  }
}
function categoryChanged() {
  taskId.value = ''
  evidence.value = null
  loadError.value = ''
}
async function load() {
  const task = selected.value
  if (!task) return
  loading.value = true
  loadError.value = ''
  evidenceId.value = evidenceIdOf(task)
  // 示例演示模式：从演示证据里取，不连后端。
  if (store.demo) {
    evidence.value = demoTraceEvidences[evidenceId.value] ?? null
    if (!evidence.value) loadError.value = '演示数据里没有这个任务的五要素证据。'
    loading.value = false
    return
  }
  try {
    evidence.value = await complianceApi.evidence(evidenceId.value)
  } catch (exception) {
    evidence.value = null
    loadError.value = isNotFound(exception)
      ? `这个任务（${categoryOf(task.capabilityCode)}）在后端还没有登记五要素证据，暂时无法筛查。等后端为该任务类型补齐证据后即可查看。`
      : describeError(exception)
  } finally {
    loading.value = false
  }
}
onMounted(loadTasks)
</script>
<template>
  <div class="compliance-filter">
    <label
      >任务类别<el-select v-model="category" placeholder="请选择任务类别" @change="categoryChanged"
        ><el-option
          v-for="item in categoryOptions"
          :key="item.label"
          :label="`${item.label}（${item.count} 条任务）`"
          :value="item.label" /></el-select></label
    ><label
      >任务记录<el-select
        v-model="taskId"
        filterable
        :disabled="!category"
        placeholder="请选择任务记录"
        @change="load"
        ><el-option
          v-for="item in taskOptions"
          :key="item.taskId"
          :label="`${item.name} · ${item.taskId} · ${formatTime(item.createdAt)}`"
          :value="item.taskId" /></el-select></label
    ><span class="compliance-muted">{{
      selected ? `${selected.taskId} · 任务五要素筛查` : '先选任务类别，再选任务记录'
    }}</span
    ><el-button type="primary" :loading="loading" :disabled="!taskId" @click="load">查询</el-button>
  </div>
  <el-alert
    v-if="loadError"
    :title="loadError"
    type="warning"
    :closable="false"
    show-icon
  />
  <template v-if="selected"
    ><PanelCard title="任务信息" icon="Tickets"
      ><template #extra
        ><span class="compliance-muted">数据来自任务登记记录</span></template
      ><dl class="chain-task">
        <dt>任务号</dt>
        <dd class="compliance-id">{{ selected.taskId }}</dd>
        <dt>任务名称</dt>
        <dd>{{ selected.name }}</dd>
        <dt>任务类别</dt>
        <dd>{{ categoryOf(selected.capabilityCode) }}</dd>
        <dt>执行状态</dt>
        <dd>
          <el-tag :type="statusColor(selected.status)">{{ statusLabel(selected.status) }}</el-tag>
        </dd>
        <dt>数据来源</dt>
        <dd>{{ selected.datasetName || '未记录' }}</dd>
        <dt>数据版本</dt>
        <dd>{{ selected.datasetVersion || '未记录' }}</dd>
        <dt>创建时间</dt>
        <dd>{{ formatTime(selected.createdAt) }}</dd>
        <dt>完成时间</dt>
        <dd>{{ selected.finishedAt ? formatTime(selected.finishedAt) : '未完成' }}</dd>
      </dl></PanelCard
    ><PanelCard v-if="evidence" title="五要素留痕校验" icon="Shield"
      ><template #extra
        ><span class="compliance-muted">{{
          pendingCount ? `${pendingCount} 项待补证` : '五项均已核验'
        }}</span></template
      ><div class="chain-elements">
        <div v-for="item in elements" :key="item.key" class="chain-element" :class="item.state">
          <strong>{{ item.label }}</strong
          ><StateBadge :state="item.state" /><small v-if="item.value">{{ item.value }}</small
          ><small v-else class="chain-element-empty">未记录</small>
        </div>
      </div>
      <p class="compliance-muted">
        证据编号 {{ evidenceId || '未查询' }}；五要素取自该任务在后端登记的证据记录，标为「待补证」的项需要补充留痕。
      </p></PanelCard
    ></template
  ><el-empty v-else-if="!loading" description="请选择任务类别与任务记录，查询该任务的五要素留痕" />
</template>
<style scoped>
/* 「任务记录」的标签是「任务名 · 任务编号 · 时间」，比合规模块其他筛选栏长，
   这里只在本页把宽度上限放宽；compliance.css 的全局值保持不变，其他页面不受影响。 */
:deep(.compliance-filter label) {
  max-width: 480px;
}
/* 加在 FullChainPage.vue 的 <style scoped> 里 */
:deep(.panel-heading h2) {
  font-size: 22px !important;
}
:deep(.compliance-muted) {
  font-size: 16px !important;
}
:deep(.compliance-id) {
  font-size: 17px !important;
  font-weight: 600 !important;
}
.chain-task {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  gap: 15px 20px;
  margin: 0;
  /* 对齐数据治理页面板的文字大小：data-governance.css 的 .process-info / .process-steps small 均为 16px。 */
  font-size: 17px;
}
.chain-task dt {
  color: #7b8fac;
  font-weight: 600;
}
.chain-task dd {
  margin: 0;
  color: #26456f;
  overflow-wrap: anywhere;
}
.chain-elements {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}
.chain-element {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-height: 118px;
  padding: 16px 12px;
  border: 1px solid #dbe7f6;
  border-radius: 10px;
  background: #f7faff;
  text-align: center;
}
.chain-element.verified {
  border-color: #b9e3cd;
  background: #f2fbf6;
}
.chain-element.missing {
  border-color: #f0b7b0;
  background: #fff5f4;
}
.chain-element strong {
  font-size: 18px;
  font-weight: 600;
  color: #10275f;
}
.chain-element small {
  font-size: 16px;
  line-height: 1.6;
  color: #476590;
  overflow-wrap: anywhere;
}
.chain-element-empty {
  color: #a3b3c9 !important;
}
@media (max-width: 1100px) {
  .chain-elements {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
