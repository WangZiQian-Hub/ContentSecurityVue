<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useComplianceStore } from '../../stores/compliance'
import PanelCard from '../../components/PanelCard.vue'
import AppIcon from '../../components/AppIcon.vue'
import ContextSelector from './components/ContextSelector.vue'
import StateBadge from './components/StateBadge.vue'
import EvidenceLinks from './components/EvidenceLinks.vue'
import AuditReviewDialog from './components/AuditReviewDialog.vue'
import { formatTime } from './presentation'
const store = useComplianceStore(),
  selected = ref(''),
  reviewOpen = ref(false)
const result = computed(() =>
  store.audit?.result.kind === 'reasoning_audit' ? store.audit.result : null,
)
const risk = computed(() => result.value?.riskNodes.find((n) => n.stepId === selected.value))
const activation = computed(() => {
  const value = result.value?.activation,
    context = store.context
  return value &&
    context &&
    value.modelId === context.modelId &&
    value.modelVersion === context.modelVersion &&
    value.inferenceId === context.inferenceId &&
    value.captureId === context.captureId
    ? value
    : null
})
watch(result, () => (selected.value = result.value?.riskNodes[0]?.stepId || ''))
</script>
<template>
  <ContextSelector kind="model_call" label="调用记录" capability="reasoning_audit" />
  <template v-if="result"
    ><div class="compliance-split">
      <PanelCard title="可观测调用步骤" icon="Share"
        ><div class="compliance-steps">
          <button
            v-for="(step, index) in result.steps"
            :key="step.id"
            class="compliance-step"
            :class="{ selected: selected === step.id }"
            @click="selected = step.id"
          >
            <span class="compliance-step-icon" :class="{ warning: step.riskLevel }"
              ><AppIcon :name="step.riskLevel ? 'Warning' : 'Tickets'"
            /></span>
            <div>
              <h3>{{ String(index + 1).padStart(2, '0') }} {{ step.label }}</h3>
              <p>{{ step.detail }}</p>
              <small>{{ formatTime(step.occurredAt) }}</small>
            </div>
            <StateBadge :state="step.riskLevel || step.verificationState" />
          </button>
        </div>
        <p class="compliance-note">
          路径记录处理节点、规则与证据，不等同于模型内部隐藏思维过程。
        </p></PanelCard
      >
      <div class="compliance-stack">
        <PanelCard title="风险步骤证据" icon="Warning"
          ><template v-if="risk"
            ><dl class="compliance-details">
              <dt>风险依据</dt>
              <dd>{{ risk.description }}</dd>
              <dt>命中规则</dt>
              <dd>{{ risk.ruleRef }}</dd>
              <dt>复核状态</dt>
              <dd><StateBadge :state="store.audit?.reviewStatus" /></dd>
            </dl>
            <EvidenceLinks :refs="risk.evidenceRefs" />
            <p v-if="risk.alertId">
              <router-link
                :to="{ path: '/compliance/risk-alert', query: { alertId: risk.alertId } }"
                >风险事件 →</router-link
              >
            </p></template
          ><template v-else
            ><p>此步骤没有已登记的风险节点。</p>
            <EvidenceLinks :refs="result.steps.find((s) => s.id === selected)?.evidenceRefs || []"
          /></template>
          <p>{{ result.auditResult }}</p>
          <el-button @click="reviewOpen = true">人工复核</el-button></PanelCard
        >
        <PanelCard title="内部激活证据关联" icon="Box"
          ><template v-if="activation"
            ><h3>同一模型版本与捕获对象</h3>
            <p>{{ activation.modelVersion }} / {{ activation.captureId }}</p>
            <el-tag>关联线索，不作为因果结论</el-tag>
            <p>
              <router-link
                :to="{
                  path: '/compliance/model-internal',
                  query: {
                    modelId: String(activation.modelId),
                    versionId: activation.modelVersion,
                    captureId: activation.captureId,
                  },
                }"
                >模型内部审计 →</router-link
              >
            </p></template
          ><el-empty v-else description="没有精确匹配的内部捕获记录" :image-size="70"
        /></PanelCard>
      </div></div></template
  ><el-empty
    v-else-if="!store.loading && !store.error"
    description="暂无匹配的推理审计结果，请选择调用记录"
  /><AuditReviewDialog v-model="reviewOpen" />
</template>
