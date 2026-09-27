<script setup lang="ts">
import KpiStrip from '../../../components/KpiStrip.vue'
import { VALUE_KIND } from '../../../types/data-value'
import type { Kpi } from '../../../types'

const descriptions: Record<string, string> = {
  'value-0': '所有数据集最新分析结果中，有效评分样本的综合价值分数平均值。',
  'value-1': '所有数据集最新分析结果中，高价值样本数占全部已分析样本数的比例。',
  'value-2': '所有数据集最新分析结果中，完成有效评分的样本条次。',
  'value-3': '所有数据集最新分析结果中，已分析样本覆盖的语种数。',
}

function formatValue(item: Kpi) {
  if (item.id !== 'value-2') {
    return {
      value: new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 10 }).format(item.value),
      unit: item.unit,
    }
  }
  const scale = item.value >= 100_000_000 ? 100_000_000 : item.value >= 10_000 ? 10_000 : 1
  const value = scale === 1 ? item.value : Math.floor((item.value / scale) * 100) / 100
  return {
    value: new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value),
    unit: scale === 1 ? item.unit : `${scale === 100_000_000 ? '亿' : '万'}条次`,
  }
}
</script>

<template>
  <KpiStrip :kind="VALUE_KIND" hide-comparison :title-descriptions="descriptions">
    <template #value="{ item }">
      <span
        :title="item.id === 'value-2' ? `${item.value.toLocaleString('zh-CN')} 条次` : undefined"
        >{{ formatValue(item).value }} <small>{{ formatValue(item).unit }}</small></span
      >
    </template>
  </KpiStrip>
</template>
