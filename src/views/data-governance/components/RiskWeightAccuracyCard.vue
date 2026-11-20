<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import GovernanceRateCard from './GovernanceRateCard.vue'
import { getRiskResultWeightAccuracy, getRiskWeightAccuracyOverview } from '../../../api/data-risk'
import { isMock } from '../../../api/request'
import { isGovernanceLlm } from '../../../api/governance-llm'
import type { RiskWeightAccuracy } from '../../../types/data-risk'

const props = defineProps<{ variant: 'overview' | 'result'; resultId?: string }>()
const data = ref<RiskWeightAccuracy>()
const loading = ref(false)
const failed = ref(false)
let generation = 0
const hasAccuracy = computed(
  () => data.value && data.value.totalCount > 0 && data.value.accuracyPercent !== null,
)
const percentage = computed(() => Math.min(100, Math.max(0, data.value?.accuracyPercent ?? 0)))
const explanation = computed(() => {
  const scope =
    props.variant === 'overview'
      ? '总体统计：每个数据集、固定版本和分级方案只纳入最新全语种检测结果。'
      : '当前检测批次统计，与已选结果对应，不随样本列表的筛选或分页变化。'
  return `${scope}准确率 = 判别正确的样本数 / 纳入评估的样本总数 × 100%。${isMock && !isGovernanceLlm ? '当前为模拟演示数据。' : ''}`
})
const scopeNote = computed(() => {
  const stats = data.value
  if (stats?.validCount == null || stats.validCount === stats.totalCount) return
  return `分母为有标准档位标注的 ${stats.totalCount.toLocaleString()} 条 · 本范围有效检测共 ${stats.validCount.toLocaleString()} 条`
})
async function load() {
  const ticket = ++generation
  data.value = undefined
  failed.value = false
  loading.value = false
  if (props.variant === 'result' && !props.resultId) return
  loading.value = true
  try {
    const value =
      props.variant === 'overview'
        ? await getRiskWeightAccuracyOverview()
        : await getRiskResultWeightAccuracy(props.resultId!)
    if (ticket === generation) data.value = value
  } catch {
    if (ticket === generation) failed.value = true
  } finally {
    if (ticket === generation) loading.value = false
  }
}
watch(() => [props.variant, props.resultId], load, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => {
  generation++
})
</script>

<template>
  <GovernanceRateCard
    :variant="variant"
    title="数据权重判别准确率"
    :explanation="explanation"
    :percentage="hasAccuracy ? percentage : null"
    :counts="data"
    count-label="正确判别"
    :scope-note="scopeNote"
    :loading="loading"
    :failed="failed"
    @retry="load"
  />
</template>
