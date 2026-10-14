<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { useDataResourceStore } from '../../../stores/data-resource'
import type { IngestTask } from '../../../types/data-resource'
import { TASK_STATUS } from '../../../utils/enums'
const props = defineProps<{ compact?: boolean }>()
const emit = defineEmits<{ select: [task: IngestTask] }>()
const store = useDataResourceStore()
const query = reactive({ page: 1, pageSize: props.compact ? 5 : 10, keyword: '', status: '' })
const loading = ref(false)
const error = ref(false)
const detail = ref<IngestTask>()
let pollTimer: ReturnType<typeof setTimeout> | undefined
let polling = false
const terminalStatuses = new Set(['succeeded', 'failed', 'cancelled'])
// 轮询间隔：数据处理不是秒级操作，5 秒足够，也避免把后端和界面刷得太频繁。
const POLL_INTERVAL_MS = 5000
// 只轮询最近 1 天内创建的任务：更早的任务不可能还在正常处理（多为中断遗留的僵尸任务），
// 否则它们会让轮询永久续期。
const POLL_MAX_AGE_MS = 24 * 60 * 60 * 1000
/**
 * 只有「未到终态 + 创建于最近 1 天内」的任务才需要轮询。
 * 创建时间无法解析时按“不轮询”处理，避免脏数据导致无限刷新。
 */
function isPollable(task: IngestTask) {
  if (terminalStatuses.has(task.status)) return false
  const createdAt = new Date(task.createdAt).getTime()
  return Number.isFinite(createdAt) && Date.now() - createdAt <= POLL_MAX_AGE_MS
}
async function load(silent = false) {
  // 轮询走静默刷新：不动 loading，表格就不会每隔 5 秒闪一次转圈
  if (!silent) {
    loading.value = true
    error.value = false
  }
  try {
    await store.loadTasks(query)
  } catch {
    if (!silent) error.value = true
  } finally {
    if (!silent) loading.value = false
  }
}
function stopPolling() {
  polling = false
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = undefined
  }
}
async function pollRunningTasks() {
  if (!polling) return
  await load(true)
  if (!polling) return
  // 只认最近 1 天内的非终态任务；更早的僵尸任务不再让轮询续期
  if (store.tasks.some(isPollable)) {
    pollTimer = setTimeout(() => void pollRunningTasks(), POLL_INTERVAL_MS)
  } else {
    stopPolling()
  }
}
function startPolling() {
  stopPolling()
  polling = true
  void pollRunningTasks()
}
function search() {
  query.page = 1
  void load()
}
function select(task: IngestTask) {
  detail.value = task
  emit('select', task)
}
onMounted(async () => {
  await load()
  if (store.tasks.some(isPollable)) startPolling()
})
onUnmounted(stopPolling)
</script>
<template>
  <div v-if="!compact" class="resource-toolbar">
    <el-input
      v-model="query.keyword"
      clearable
      placeholder="搜索任务名称或来源"
      aria-label="搜索任务"
      @input="search"
    />
    <el-select
      v-model="query.status"
      placeholder="全部状态"
      clearable
      aria-label="任务状态"
      @change="search"
      ><el-option v-for="(item, key) in TASK_STATUS" :key="key" :value="key" :label="item.label"
    /></el-select>
    <el-button @click="load()">刷新记录</el-button>
  </div>
  <el-alert v-if="error" title="任务记录加载失败" type="error" :closable="false"
    ><el-button link @click="load()">重试</el-button></el-alert
  >
  <el-table
    v-loading="loading"
    class="shared-data-table"
    :data="store.tasks"
    empty-text="暂无接入任务"
    @row-click="(task: IngestTask) => emit('select', task)"
  >
    <el-table-column prop="name" label="任务名称" min-width="170" />
    <el-table-column prop="sourceName" label="数据源" min-width="100" />
    <el-table-column v-if="compact" label="数据量" width="110"
      ><template #default="{ row }">{{ row.storageGb }} GB</template></el-table-column
    >
    <el-table-column v-else prop="datasetName" label="目标数据集" min-width="190" />
    <el-table-column v-if="!compact" label="接入进度" min-width="160"
      ><template #default="{ row }"
        ><el-progress :percentage="row.progress" :stroke-width="8" /></template
    ></el-table-column>
    <el-table-column label="状态" width="90"
      ><template #default="{ row }: { row: IngestTask }"
        ><el-tag :type="TASK_STATUS[row.status].color" round size="small">{{
          row.status === 'pending' ? '等待执行' : TASK_STATUS[row.status].label
        }}</el-tag></template
      ></el-table-column
    >
    <el-table-column label="接入时间" min-width="140"
      ><template #default="{ row }">{{
        new Date(row.createdAt).toLocaleString('zh-CN', { hour12: false })
      }}</template></el-table-column
    >
    <el-table-column label="操作" width="85"
      ><template #default="{ row }"
        ><el-button link type="primary" @click.stop="select(row)">查看</el-button></template
      ></el-table-column
    >
  </el-table>
  <el-pagination
    v-if="!compact"
    v-model:current-page="query.page"
    :page-size="query.pageSize"
    :total="store.taskTotal"
    layout="total, prev, pager, next"
    @current-change="() => load()"
  />
  <el-dialog :model-value="!!detail" title="接入任务详情" width="600px" @close="detail = undefined" class="ingest-task-detail">
    <el-descriptions v-if="detail" :column="1" border
      ><el-descriptions-item label="任务名称">{{ detail.name }}</el-descriptions-item
      ><el-descriptions-item label="任务 ID">{{ detail.taskId }}</el-descriptions-item
      ><el-descriptions-item label="目标数据集">{{ detail.datasetName }}</el-descriptions-item
      ><el-descriptions-item label="状态">{{
        detail.status === 'pending' ? '等待执行' : TASK_STATUS[detail.status].label
      }}</el-descriptions-item
      ><el-descriptions-item label="链路 ID">{{
        detail.traceId
      }}</el-descriptions-item></el-descriptions
    >
  </el-dialog>
</template>
