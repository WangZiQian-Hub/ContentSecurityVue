<script setup lang="ts">
import PanelCard from '../../../../components/PanelCard.vue'
import { agentStatus, agentModeLabels } from '../../../../types/internal-agent'
import type { AgentRun } from '../../../../types/internal-agent'
defineProps<{ runs: AgentRun[] }>()
defineEmits<{ select: [string] }>()
const time = (v: string) => new Date(v).toLocaleString('zh-CN', { hour12: false })
const modeLabel = (run: AgentRun) => agentModeLabels[run.mode || 'privacy']
</script>
<template>
  <PanelCard title="最近任务" icon="List">
    <p class="hint">显示当前账号最近 50 次任务。任务完成状态与轨迹风险结论分别记录。</p>
    <el-table
      :data="runs"
      row-key="runId"
      highlight-current-row
      @row-click="$emit('select', $event.runId)"
    >
      <el-table-column label="编号" min-width="180"
        ><template #default="{ row }"
          ><el-button link type="primary" @click.stop="$emit('select', row.runId)">{{
            row.runId
          }}</el-button></template
        ></el-table-column
      >
      <el-table-column label="所属批次" min-width="180" show-overflow-tooltip>
        <template #default="{ row }"
          ><span :title="row.batch ? `${row.batch.name}（${row.batch.displayId}）` : ''">{{
            row.batch?.name || '任务结束后归档'
          }}</span></template
        >
      </el-table-column>
      <el-table-column label="模式" min-width="130"
        ><template #default="{ row }">{{ modeLabel(row) }}</template></el-table-column
      >
      <el-table-column label="状态" min-width="125"
        ><template #default="{ row }"
          >{{ agentStatus(row.status)
          }}{{ row.stopRequested && row.status === 'running' ? '（停止中）' : '' }}</template
        ></el-table-column
      >
      <el-table-column label="轮数" width="75"
        ><template #default="{ row }"
          >{{ row.rounds }}/{{ row.maxRounds }}</template
        ></el-table-column
      >
      <el-table-column prop="callCount" label="工具" width="65" />
      <el-table-column label="Token" width="95"
        ><template #default="{ row }">{{
          row.tokenUsage.totalTokens ?? '未提供'
        }}</template></el-table-column
      >
      <el-table-column label="数据集" min-width="150"
        ><template #default="{ row }">{{ row.dataset.name }}</template></el-table-column
      >
      <el-table-column label="发起时间" min-width="170"
        ><template #default="{ row }">{{ time(row.createdAt) }}</template></el-table-column
      >
      <template #empty>尚无任务。在左侧选择测试数据集并发起任务。</template>
    </el-table>
  </PanelCard>
</template>
<style scoped>
.hint {
  font-size: 13px;
  color: #6e85a5;
  margin: 0 0 15px;
  line-height: 1.7;
}
</style>
