<script setup lang="ts">
import { ref } from 'vue'
import { usePlatformStore } from '../stores/platform'
import { TASK_STATUS } from '../utils/enums'
import type { Task } from '../types'
const store = usePlatformStore()
const selected = ref<Task>()
const isOpen = ref(false)
function showTask(task: Task) {
  selected.value = task
  isOpen.value = true
}
</script>
<template>
  <el-table :data="store.tasks.slice(0, 5)" stripe size="small"
    >
    <el-table-column type="index" label="#" width="50" />
    <el-table-column prop="name" label="任务名称" min-width="110"/>
    <el-table-column prop="taskCategory" label="任务类别" min-width="80" />
    <el-table-column label="状态" width="90">
      <template #default="{ row }"
        ><span :class="`status-${row.status}`"
          >● {{ TASK_STATUS[row.status as keyof typeof TASK_STATUS]?.label }}</span
        ></template
      ></el-table-column
    >
    <el-table-column label="创建时间" min-width="100"
      ><template #default="{ row }">{{
        new Date(row.createdAt).toLocaleString('zh-CN', { hour12: false })
      }}</template></el-table-column
    >
    <el-table-column label="操作" width="100"
      ><template #default="{ row }"
        ><el-button link type="primary" @click="showTask(row)">查看</el-button></template
      ></el-table-column
    >
    </el-table>
    
    <el-drawer v-model="isOpen" title="任务详情" size="480px" class="task-detail-drawer"
    ><template v-if="selected"
      ><h3>{{ selected.name }}</h3>
      <el-descriptions :column="1" border
        ><el-descriptions-item label="任务 ID">{{ selected.taskId }}</el-descriptions-item
        ><el-descriptions-item label="状态">{{
          TASK_STATUS[selected.status].label
        }}</el-descriptions-item
        ><el-descriptions-item label="能力编码">{{
          selected.capabilityCode
        }}</el-descriptions-item></el-descriptions
      >
      <pre>{{ selected.result || '示例任务，等待接入后端结果与全链路日志。' }}</pre>
    </template></el-drawer
  >
</template>
