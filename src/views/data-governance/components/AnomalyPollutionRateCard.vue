<script setup lang="ts">
import { computed } from 'vue'
import GovernanceRateCard from './GovernanceRateCard.vue'
import type { PollutionIdentification } from '../../../types/data-anomaly'

const props = defineProps<{
  variant: 'overview' | 'result'
  stats?: PollutionIdentification
}>()
const explanation = computed(() => {
  const scope =
    props.variant === 'overview'
      ? '按各数据集版本的最新检测结果汇总。'
      : '仅统计当前批次，不受列表筛选或分页影响。'
  return `${scope}识别率 = 正确识别的污染样本数 ÷ 人工标为污染的有效样本数 × 100%。达标要求 ≥90%。`
})
const percentage = computed(() => {
  const stats = props.stats
  return stats && stats.totalCount > 0 ? (stats.correctCount / stats.totalCount) * 100 : null
})
const scopeNote = computed(() => {
  const stats = props.stats
  if (!stats) return
  const threshold = stats.correctCount * 10 >= stats.totalCount * 9 ? '达标' : '未达标'
  return `分母为人工标注为污染的有效样本 ${stats.totalCount.toLocaleString()} 条 · 本范围有效检测共 ${stats.validCount.toLocaleString()} 条 · ${threshold}（要求 ≥90%）`
})
</script>

<template>
  <GovernanceRateCard
    :variant="variant"
    title="污染样本识别率"
    :explanation="explanation"
    :percentage="percentage"
    :counts="stats"
    count-label="正确识别"
    :scope-note="scopeNote"
  />
</template>
