<script setup lang="ts">
import { ref, watch } from 'vue'
import PanelCard from '../../../components/PanelCard.vue'
import ProcessTaskPanel from './ProcessTaskPanel.vue'
import { useDataGovernanceStore } from '../../../stores/data-governance'
import { TASK_STATUS } from '../../../utils/enums'
import type { ProcessTask } from '../../../types/data-governance'
const store = useDataGovernanceStore()
const historyOpen = ref(false)
const page = ref(1)
const historyLoading = ref(false)
const historyError = ref('')
const detail = ref<ProcessTask>()
async function selectTask(taskId: string, showDetail = false) {
  try {
    const task = await store.selectTask(taskId)
    if (showDetail) detail.value = task
  } catch {
    historyError.value = '任务详情加载失败，请重试。'
  }
}
async function loadHistory() {
  historyLoading.value = true
  historyError.value = ''
  try {
    await store.loadHistory(page.value)
  } catch {
    historyError.value = '任务列表加载失败，请重试。'
  } finally {
    historyLoading.value = false
  }
}
watch(historyOpen, (open) => {
  if (open) {
    page.value = 1
    void loadHistory()
  }
})
</script>
<template>
  <div>
    <el-alert
      v-if="historyError && !historyOpen"
      :title="historyError"
      type="error"
      :closable="false"
    />
    <PanelCard title="最近处理任务" icon="Clock" class="process-recent">
      <template #extra>
        <button type="button" class="panel-more" @click="historyOpen = true">查看更多 ›</button>
      </template>
      <el-table
        :data="store.tasks.slice(0, 3)"
        class="shared-data-table"
        empty-text="暂无处理任务"
      >
        <el-table-column type="index" label="#" width="48" align="center" />
        <el-table-column prop="name" label="任务名称" min-width="140" />
        <el-table-column prop="datasetName" label="数据集" min-width="190" show-overflow-tooltip />
        <el-table-column prop="ruleName" label="处理规则" min-width="180" />
        <el-table-column label="输出版本" min-width="150" show-overflow-tooltip
          ><template #default="{ row }">{{ row.outputVersion ?? '—' }}</template></el-table-column
        >
        <el-table-column label="状态" width="120"
          ><template #default="{ row }: { row: ProcessTask }"
            ><span class="process-status" :class="row.status"
              >● {{ TASK_STATUS[row.status].label }}</span
            ></template
          ></el-table-column
        >
        <el-table-column label="完成时间" min-width="185"
          ><template #default="{ row }">{{
            row.finishedAt
              ? new Date(row.finishedAt).toLocaleString('zh-CN', { hour12: false })
              : '—'
          }}</template></el-table-column
        >
        <el-table-column label="操作" width="85" align="center"
          ><template #default="{ row }"
            ><el-button link type="primary" @click="selectTask(row.taskId, true)"
              >查看</el-button
            ></template
          ></el-table-column
        >
      </el-table>
    </PanelCard>
    <el-dialog
      :model-value="!!detail"
      title="处理任务详情"
      width="1000px"
      class="governance-dialog"
      @close="detail = undefined"
    >
      <template v-if="detail"
        ><el-descriptions :column="2" border
          ><el-descriptions-item label="任务ID">{{ detail.taskId }}</el-descriptions-item
          ><el-descriptions-item label="链路ID">{{ detail.traceId }}</el-descriptions-item
          ><el-descriptions-item label="输入版本">{{
            detail.input.datasetVersionId
          }}</el-descriptions-item
          ><el-descriptions-item label="输出版本">{{
            detail.outputVersion ?? '尚未生成'
          }}</el-descriptions-item
          ><el-descriptions-item label="数据集">{{ detail.datasetName }}</el-descriptions-item
          ><el-descriptions-item label="处理模板">{{ detail.ruleName }}</el-descriptions-item>
          <el-descriptions-item label="规则执行顺序">{{
            detail.input.rules.join(' → ')
          }}</el-descriptions-item>
          <el-descriptions-item label="范围">{{
            detail.input.scope === 'all'
              ? '全量数据'
              : detail.input.scope === 'batch'
                ? '指定批次：' + detail.input.batchId
                : '筛选条件：' + detail.input.filter?.keyword
          }}</el-descriptions-item></el-descriptions
        ><ProcessTaskPanel :task="detail"
      /></template>
    </el-dialog>
    <el-drawer v-model="historyOpen" title="处理任务记录" size="800px" class="process-history-drawer">
      <el-alert v-if="historyError" :title="historyError" type="error" :closable="false"
        ><el-button link @click="loadHistory">重试</el-button></el-alert
      >
      <el-table v-loading="historyLoading" :data="store.history" class="shared-data-table" empty-text="暂无处理任务"
        ><el-table-column prop="name" label="任务名称" width="200"/><el-table-column
          prop="datasetName"
          label="数据集"
          show-overflow-tooltip
          min-width="200"
        /><el-table-column label="状态" width="130"
          ><template #default="{ row }: { row: ProcessTask }">{{
            TASK_STATUS[row.status].label
          }}</template></el-table-column
        ><el-table-column label="操作" width="120"
          ><template #default="{ row }"
            ><el-button link type="primary" @click="selectTask(row.taskId, true)"
              >查看</el-button
            ></template
          ></el-table-column
        ></el-table
      >
      <el-pagination
        v-model:current-page="page"
        :total="store.total"
        :page-size="10"
        layout="prev, pager, next, total"
        @current-change="loadHistory"
      />
    </el-drawer>
  </div>
</template>
