<script setup lang="ts">
import PanelCard from '../../../components/PanelCard.vue'
import AppIcon from '../../../components/AppIcon.vue'
import ProcessComparisonTable from './ProcessComparisonTable.vue'
import { TASK_STATUS } from '../../../utils/enums'
import type { ProcessTask } from '../../../types/data-governance'
defineProps<{ task?: ProcessTask }>()
</script>
<template>
  <PanelCard title="当前处理任务" icon="Document" class="process-current">
    <template #extra
      ><div v-if="task" class="process-task-meta">
        <span>任务ID：{{ task.taskId }}</span
        ><el-tag :type="TASK_STATUS[task.status].color">{{
          TASK_STATUS[task.status].label
        }}</el-tag>
      </div></template
    >
    <template v-if="task">
      <ol class="process-steps" aria-label="数据处理阶段">
        <li v-for="(step, index) in task.steps" :key="`${index}-${step.name}`" :class="step.status">
          <span class="process-step-dot"
            ><AppIcon v-if="step.status === 'succeeded'" name="Check" /><AppIcon
              v-else-if="step.status === 'failed'"
              name="Close" /><i v-else
          /></span>
          <b>{{ step.name }}</b
          ><small>{{
            step.status === 'pending'
              ? '待处理'
              : step.status === 'running'
                ? '处理中'
                : TASK_STATUS[step.status].label
          }}</small>
        </li>
      </ol>
      <div class="process-progress">
        <b>整体进度</b
        ><el-progress :percentage="task.progress" :stroke-width="17" :show-text="false" /><strong
          >{{ task.progress }}%</strong
        ><span
          >{{ task.processedCount.toLocaleString() }} /
          {{ task.totalCount.toLocaleString() }} 条</span
        ><span v-if="task.status === 'running' && task.remainingSeconds !== null"
          >预计剩余 {{ Math.ceil(task.remainingSeconds / 60) }} 分钟</span
        >
      </div>
      <el-alert
        v-if="task.errorMessage"
        :title="task.errorMessage"
        type="error"
        :closable="false"
      />
      <ProcessComparisonTable title="处理前后对比" :items="task.comparisons" />
    </template>
    <el-empty v-else description="暂无处理任务，请选择数据集创建任务" />
  </PanelCard>
</template>
