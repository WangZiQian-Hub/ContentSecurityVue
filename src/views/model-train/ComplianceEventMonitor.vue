<script setup lang="ts">
/** 训练中合规事件监控面板（GN18-19）：
 * 顶部三项汇总 + 最近事件记录；“查看全部记录”打开完整记录弹窗。
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import PanelCard from '../../components/PanelCard.vue'
import AppIcon from '../../components/AppIcon.vue'
import { useComplianceEventsStore } from '../../stores/compliance-events'
import {
  complianceEventLevels,
  complianceEventStatuses,
  formatEventTime,
  type ComplianceEventLevel,
  type ComplianceEventStatus,
} from '../../types/compliance-event'

const props = defineProps<{
  /** 关联的训练任务 ID；未传时由后端返回默认（mock 下为固定样例）。 */
  trainingTaskId?: string
  /** 训练是否进行中：为 true 时每 5 秒刷新一次概览。 */
  running?: boolean
}>()

const store = useComplianceEventsStore()
const root = ref<HTMLElement>()
const highlighted = ref(false)

/** 级别标签颜色。 */
const levelTagType: Record<ComplianceEventLevel, 'danger' | 'warning' | 'primary'> = {
  high: 'danger',
  medium: 'warning',
  low: 'primary',
}
/** 状态标签颜色。 */
const statusTagType: Record<ComplianceEventStatus, 'primary' | 'success' | 'info'> = {
  recorded: 'primary',
  blocked: 'success',
  handled: 'success',
  ignored: 'info',
}

function refresh() {
  void store.loadOverview(props.trainingTaskId)
}

let pollTimer: ReturnType<typeof setTimeout> | undefined
function stopPolling() {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = undefined
}
function schedulePolling() {
  stopPolling()
  if (!props.running) return
  pollTimer = setTimeout(() => {
    refresh()
    schedulePolling()
  }, 5000)
}

watch(
  () => props.trainingTaskId,
  () => refresh(),
)
watch(
  () => props.running,
  () => schedulePolling(),
)

/** 点“合规监控”入口：滚动定位到面板并短暂高亮。 */
watch(
  () => store.focusRequested,
  () => {
    root.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    highlighted.value = true
    setTimeout(() => (highlighted.value = false), 2000)
  },
)

onMounted(() => {
  refresh()
  schedulePolling()
})
onUnmounted(stopPolling)
</script>

<template>
  <PanelCard title="合规事件监控" icon="Shield">
    <template #extra>
      <el-button link type="primary" @click="store.openRecordDialog(props.trainingTaskId)">
        查看全部记录 →
      </el-button>
    </template>
    <div
      ref="root"
      v-loading="store.loading"
      :class="['ce-monitor', { highlight: highlighted }]"
    >
      <el-alert
        v-if="store.error"
        class="ce-error"
        type="warning"
        show-icon
        :closable="false"
        :title="store.error"
      />
      <div v-if="store.overview" class="ce-stat-row">
        <div class="ce-stat blue">
          <el-icon class="ce-icon"><AppIcon name="Tickets" /></el-icon>
          <div>
            <span class="ce-label">累计事件</span>
            <strong>{{ store.overview.summary.total }}</strong>
          </div>
        </div>
        <div class="ce-stat red">
          <el-icon class="ce-icon"><AppIcon name="WarningFilled" /></el-icon>
          <div>
            <span class="ce-label">高风险</span>
            <strong>{{ store.overview.summary.highRisk }}</strong>
          </div>
        </div>
        <div class="ce-stat green">
          <el-icon class="ce-icon"><AppIcon name="CircleCheckFilled" /></el-icon>
          <div>
            <span class="ce-label">已处置</span>
            <strong>{{ store.overview.summary.handled }}</strong>
          </div>
        </div>
      </div>

      <h3 class="ce-table-title">最近事件记录</h3>
      <el-table
        :data="store.overview?.recentEvents ?? []"
        border
        :empty-text="store.error ? '未能加载合规事件' : '暂无合规事件'"
      >
        <el-table-column label="时间" width="95">
          <template #default="{ row }">{{ formatEventTime(row.time) }}</template>
        </el-table-column>
        <el-table-column prop="eventType" label="事件类型" min-width="150" />
        <el-table-column label="级别" width="85">
          <template #default="{ row }">
            <el-tag :type="levelTagType[row.level as ComplianceEventLevel]" size="small">
              {{ complianceEventLevels[row.level as ComplianceEventLevel] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="85">
          <template #default="{ row }">
            <el-tag :type="statusTagType[row.status as ComplianceEventStatus]" size="small">
              {{ complianceEventStatuses[row.status as ComplianceEventStatus] }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </PanelCard>

  <!-- 全部合规事件记录 -->
  <el-dialog
    :model-value="store.dialogOpen"
    title="合规事件记录"
    width="720px"
    class="mw-dialog"
    @close="store.closeRecordDialog()"
  >
    <el-table v-loading="store.pageLoading" :data="store.page?.items ?? []" border>
      <el-table-column label="时间" width="95">
        <template #default="{ row }">{{ formatEventTime(row.time) }}</template>
      </el-table-column>
      <el-table-column prop="eventType" label="事件类型" min-width="140" />
      <el-table-column label="级别" width="80">
        <template #default="{ row }">
          <el-tag :type="levelTagType[row.level as ComplianceEventLevel]" size="small">
            {{ complianceEventLevels[row.level as ComplianceEventLevel] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="statusTagType[row.status as ComplianceEventStatus]" size="small">
            {{ complianceEventStatuses[row.status as ComplianceEventStatus] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="详情" min-width="180">
        <template #default="{ row }">{{ row.detail || '—' }}</template>
      </el-table-column>
    </el-table>
    <el-pagination
      v-if="store.page"
      class="ce-pager"
      background
      layout="total, prev, pager, next"
      :total="store.page.total"
      :page-size="store.page.pageSize"
      :current-page="store.currentPage"
      @current-change="store.loadPage"
    />
  </el-dialog>
</template>

<style scoped>
.ce-monitor {
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 6px;
  transition: background 0.3s, border-color 0.3s;
}
.ce-monitor.highlight {
  background: #eef6ff;
  border-color: #9dbcf5;
}
.ce-error {
  margin-bottom: 10px;
}
.ce-stat-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.ce-stat {
  flex: 1 1 120px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid #e5edf8;
  border-radius: 8px;
  padding: 10px 12px;
}
.ce-icon {
  font-size: 34px;
  flex-shrink: 0;
}
.ce-stat.blue .ce-icon {
  color: #087bff;
}
.ce-stat.red .ce-icon {
  color: #f25050;
}
.ce-stat.green .ce-icon {
  color: #22b070;
}
.ce-label {
  display: block;
  font-size: 12px;
  color: #6b82a5;
}
.ce-stat strong {
  font-size: 24px;
  color: #1d3a66;
}
.ce-table-title {
  margin: 14px 0 8px;
  font-size: 14px;
  color: #1d3a66;
}
.ce-pager {
  margin-top: 14px;
  justify-content: flex-end;
}
</style>
