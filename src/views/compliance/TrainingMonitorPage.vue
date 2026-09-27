<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useComplianceStore } from '../../stores/compliance'
import PanelCard from '../../components/PanelCard.vue'
import ContextSelector from './components/ContextSelector.vue'
import StateBadge from './components/StateBadge.vue'
import EvidenceLinks from './components/EvidenceLinks.vue'
import { formatTime } from './presentation'
const store = useComplianceStore(),
  checkpointId = ref('')
const result = computed(() =>
  store.audit?.result.kind === 'training_monitor' ? store.audit.result : null,
)
const checkpoint = computed(() =>
  result.value?.checkpoints.find((c) => c.id === checkpointId.value),
)
watch(
  result,
  () =>
    (checkpointId.value =
      result.value?.checkpoints.length === 1 ? result.value.checkpoints[0]!.id : ''),
)
</script>
<template>
  <ContextSelector kind="training_task" label="训练任务" capability="training_monitor" />
  <template v-if="result"
    ><div class="compliance-split">
      <PanelCard title="合规检查时间轴" icon="DataAnalysis"
        ><template #extra
          ><StateBadge :state="store.audit?.executionStatus" domain="execution"
        /></template>
        <div class="compliance-timeline">
          <div v-for="check in result.checks" :key="check.key" class="compliance-timeline-item">
            <time>{{ formatTime(check.occurredAt) }}</time
            ><span class="compliance-timeline-dot" :class="check.state"></span>
            <div>
              <h3>{{ check.label }}</h3>
              <p>{{ check.detail }}</p>
              <small>{{ check.ruleId }} / {{ check.ruleVersion }}</small>
              <p v-if="check.missingReason" class="compliance-warning">{{ check.missingReason }}</p>
              <EvidenceLinks :refs="check.evidenceRefs" />
            </div>
            <StateBadge :state="check.state" />
          </div></div
      ></PanelCard>
      <PanelCard title="检查点证据包" icon="Tickets"
        ><el-select v-model="checkpointId" placeholder="选择检查点" aria-label="检查点"
          ><el-option
            v-for="item in result.checkpoints"
            :key="item.id"
            :label="item.label"
            :value="item.id" /></el-select
        ><template v-if="checkpoint"
          ><dl class="compliance-details">
            <dt>训练任务</dt>
            <dd>{{ store.audit?.subjectRef.displayId }}</dd>
            <dt>检查点</dt>
            <dd>{{ checkpoint.label }}</dd>
            <dt>预期数据版本</dt>
            <dd>{{ checkpoint.expectedVersion }}</dd>
            <dt>已保存快照引用</dt>
            <dd>{{ checkpoint.snapshotRef ?? '缺失' }}</dd>
            <dt>规则版本</dt>
            <dd>{{ checkpoint.ruleVersion }}</dd>
          </dl>
          <el-alert
            v-if="!checkpoint.snapshotRef"
            title="需要训练数据负责人补证"
            description="预期版本不能替代实际快照引用；原始缺口记录保留。"
            type="warning"
            :closable="false" /><EvidenceLinks :refs="checkpoint.evidenceRefs" /></template
      ></PanelCard>
    </div>
    <PanelCard title="关联风险事件" icon="Warning"
      ><el-table :data="store.alerts?.items || []"
        ><el-table-column prop="displayId" label="事件 ID" /><el-table-column
          prop="description"
          label="事件摘要"
          min-width="260"
        /><el-table-column label="状态"
          ><template #default="{ row }"
            ><StateBadge
              :state="row.currentStatus"
              domain="alert"
              :text="
                row.currentStatus === 'pending' ? '待处理' : undefined
              " /></template></el-table-column
        ><el-table-column label="操作"
          ><template #default="{ row }"
            ><router-link :to="{ path: '/compliance/risk-alert', query: { alertId: row.id } }"
              >查看处置 →</router-link
            ></template
          ></el-table-column
        ></el-table
      >
      <p class="compliance-muted">训练操作、损失曲线和产物管理由模型训推模块维护。</p></PanelCard
    ></template
  >
  <el-empty
    v-else-if="!store.loading && !store.error"
    description="暂无匹配的训练审计结果，请选择训练任务或审计记录"
  />
</template>
