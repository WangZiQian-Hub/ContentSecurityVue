<script setup lang="ts">
import { useComplianceStore } from '../../stores/compliance'
import PanelCard from '../../components/PanelCard.vue'
import ContextSelector from './components/ContextSelector.vue'
import StateBadge from './components/StateBadge.vue'
import EvidenceLinks from './components/EvidenceLinks.vue'
import { formatTime } from './presentation'
const store = useComplianceStore()
</script>
<template>
  <ContextSelector kind="model_call" label="Trace / 调用记录" />
  <template v-if="store.trace"
    ><PanelCard title="五要素留痕校验" icon="Shield"
      ><template #extra><span class="compliance-muted">基于全部适用阶段逐项核验</span></template>
      <div class="compliance-checks">
        <div v-for="check in store.trace.checks" :key="`${check.stage}-${check.key}`">
          <strong>{{ check.stage ? `${check.stage} · ` : '' }}{{ check.label }}</strong
          ><StateBadge :state="check.state" /><small v-if="check.missingReason">{{
            check.missingReason
          }}</small
          ><EvidenceLinks :refs="check.evidenceRefs" />
        </div></div
    ></PanelCard>
    <PanelCard title="跨阶段证据关联" icon="Share"
      ><template #extra
        ><span class="compliance-muted"
          >历史来源依据模型版本关联，保留原始 Trace 与时间</span
        ></template
      ><el-table :data="store.trace.records" stripe
        ><el-table-column label="记录范围" width="110"
          ><template #default="{ row }">{{
            row.recordScope === 'provenance' ? '历史来源' : '本次调用'
          }}</template></el-table-column
        ><el-table-column prop="stage" label="阶段" min-width="120" /><el-table-column
          label="对象"
          min-width="140"
          ><template #default="{ row }">{{ row.subjectRef.displayId }}</template></el-table-column
        ><el-table-column label="版本" min-width="110"
          ><template #default="{ row }">{{
            row.subjectRef.versionId ?? '未记录'
          }}</template></el-table-column
        ><el-table-column label="核验状态" width="100"
          ><template #default="{ row }"
            ><StateBadge :state="row.verificationState" /></template></el-table-column
        ><el-table-column label="来源时间 / Trace" min-width="220"
          ><template #default="{ row }"
            >{{ formatTime(row.occurredAt) }}
            <div class="compliance-id" :title="row.sourceTraceId">
              {{ row.sourceTraceId ?? '未记录' }}
            </div></template
          ></el-table-column
        ><el-table-column label="操作" min-width="130"
          ><template #default="{ row }"
            ><EvidenceLinks :refs="row.evidenceRefs" /><router-link
              v-if="row.subjectRef.entityType === 'training_task'"
              :to="{
                path: '/compliance/training-monitor',
                query: { trainingTaskId: row.subjectRef.entityId },
              }"
              >训练监控 →</router-link
            ></template
          ></el-table-column
        ></el-table
      ></PanelCard
    >
    <PanelCard title="整链核验结论" icon="Shield"
      ><template #extra><StateBadge :state="store.trace.complianceStatus" /></template>
      <div class="compliance-conclusion">
        <strong>{{ store.trace.conclusion }}</strong
        ><router-link
          v-for="gap in store.trace.gaps.filter((g) => g.alertId)"
          :key="gap.alertId!"
          :to="{ path: '/compliance/risk-alert', query: { alertId: gap.alertId } }"
          >查看缺口事件 →</router-link
        >
      </div>
      <p class="compliance-muted">
        审计引用 {{ store.trace.auditRef || '未提供' }}；证据关联完整不等同于内容无风险。
      </p></PanelCard
    ></template
  ><el-empty
    v-else-if="!store.loading && !store.error"
    description="暂无整链结果，请输入 Trace 或选择调用记录"
  />
</template>
