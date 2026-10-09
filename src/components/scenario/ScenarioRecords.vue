<script setup lang="ts">
import { ref, watch } from 'vue'
import PanelCard from '../PanelCard.vue'
import { getScenarioRecord, listScenarioRecords } from '../../api/scenario'
import type { AnalysisRecord, ScenarioCode } from '../../types/scenario'
/* 场景分析记录：直接读模型服务的 /analysis/records（文档第 7.1 节）。
   注意该接口不支持 model_id / service_id / version 筛选，也不返回业务任务。 */
const props = defineProps<{ scenarioCode: ScenarioCode | '' }>()
const emit = defineEmits<{ (event: 'open', record: AnalysisRecord): void }>()

const rows = ref<AnalysisRecord[]>([])
const loading = ref(false)
const opening = ref('')
const error = ref('')
const page = ref(1)
const pageSize = 10
const total = ref(0)

const statusLabels: Record<string, string> = {
  succeeded: '已完成',
  failed: '失败',
  running: '进行中',
}
const statusTypes: Record<string, 'success' | 'danger' | 'primary'> = {
  succeeded: 'success',
  failed: 'danger',
  running: 'primary',
}

function formatTime(value: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—'
}

/** 404 在这条链路上通常表示地址上不是模型服务或该接口未实现，
 *  而不是「这个场景没有记录」。直接说清区别，避免被当成空数据。 */
function describeError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : ''
  if (/\b404\b/.test(message))
    return '接口返回 404：当前地址上可能不是模型服务，或 /analysis/records 尚未实现。'
  return message || '场景分析记录读取失败。'
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const result = await listScenarioRecords({
      scenarioCode: props.scenarioCode,
      page: page.value,
      pageSize,
    })
    rows.value = result.items
    total.value = result.total
  } catch (cause) {
    rows.value = []
    total.value = 0
    error.value = describeError(cause)
  } finally {
    loading.value = false
  }
}

async function open(row: AnalysisRecord) {
  opening.value = row.id
  try {
    emit('open', await getScenarioRecord(row.id))
  } catch {
    // 详情失败时给出列表里已有的快照，至少让用户看到结果。
    emit('open', row)
  } finally {
    opening.value = ''
  }
}

watch(
  () => props.scenarioCode,
  () => {
    page.value = 1
    void load()
  },
  { immediate: true },
)
defineExpose({ reload: load })
</script>
<template>
  <PanelCard title="场景分析记录" icon="Tickets">
    <template #extra>
      <el-button link type="primary" :loading="loading" @click="load">刷新</el-button>
    </template>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-table v-else v-loading="loading" :data="rows" stripe size="small">
      <el-table-column type="index" label="#" width="56" />
      <el-table-column prop="modelId" label="模型" min-width="160" show-overflow-tooltip />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTypes[row.status] || 'info'" effect="plain" size="small">
            {{ statusLabels[row.status] || row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="耗时" width="100">
        <template #default="{ row }">{{ row.elapsedMs }} ms</template>
      </el-table-column>
      <el-table-column label="创建时间" width="190">
        <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="90">
        <template #default="{ row }">
          <el-button link type="primary" :loading="opening === row.id" @click="open(row)">
            查看
          </el-button>
        </template>
      </el-table-column>
      <template #empty>
        <p class="empty">该场景还没有分析记录。</p>
      </template>
    </el-table>
    <el-pagination
      v-if="!error && total > pageSize"
      class="pager"
      layout="total, prev, pager, next"
      :total="total"
      :page-size="pageSize"
      :current-page="page"
      @current-change="
        (value: number) => {
          page = value
          void load()
        }
      "
    />
  </PanelCard>
</template>
<style scoped>
.pager {
  margin-top: 14px;
  justify-content: flex-end;
}
.empty {
  margin: 0;
  padding: 12px 0;
  color: #96a1b3;
  font-size: 13px;
}
</style>
