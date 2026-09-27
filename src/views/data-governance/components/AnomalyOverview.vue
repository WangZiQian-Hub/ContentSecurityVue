<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getAnomalyOverview } from '../../../api/data-anomaly'
import type { Overview } from '../../../types/data-anomaly'
import type { Kpi } from '../../../types'
import KpiStrip from '../../../components/KpiStrip.vue'
const data = ref<Overview>()
const open = ref(false)
const error = ref('')
const integer = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })
const descriptions: Record<string, string> = {
  'anomaly-已检测语料': '当前可访问数据集中，按数据集、版本和样本去重后的已检测语料数。',
  'anomaly-检出异常': '已检测语料中，按每个样本最近一次检测结果统计的异常样本数。',
  'anomaly-待复核样本': '最近一次检测结果处于待复核状态的异常样本数。',
  'anomaly-已完成修复': '最近一次已成功应用修复的唯一样本数，不按修复候选数重复统计。',
}
const cards = computed<Kpi[]>(() =>
  (data.value?.cards ?? []).map((card) => ({
    ...card,
    id: `anomaly-${card.label}`,
    unit: '条',
    changeRate: 0,
  })),
)
function formatCount(value: number) {
  const scale = value >= 100_000_000 ? 100_000_000 : value >= 10_000 ? 10_000 : 1
  const displayValue = scale === 1 ? value : Math.floor((value / scale) * 100) / 100
  return {
    value: scale === 1 ? integer.format(displayValue) : decimal.format(displayValue),
    unit: scale === 1 ? '条' : `${scale === 100_000_000 ? '亿' : '万'}条次`,
  }
}
onMounted(async () => {
  try {
    data.value = await getAnomalyOverview()
  } catch (e) {
    error.value = String(e)
  }
})
</script>
<template>
  <section>
    <div class="anomaly-overview-title">
      <b>总体概览 · 当前可访问数据集</b
      ><el-button link type="primary" @click="open = true">统计口径 ›</el-button>
    </div>
    <el-alert v-if="error" :title="error" type="error" />
    <KpiStrip class="anomaly-kpi-strip" :snapshot-items="cards" hide-comparison :title-descriptions="descriptions">
      <template #value="{ item }">
        <span :title="`${item.value.toLocaleString('zh-CN')} 条`"
          >{{ formatCount(item.value).value
          }}<small>{{ formatCount(item.value).unit }}</small></span
        >
      </template>
    </KpiStrip>
    <el-drawer v-model="open" title="总体统计口径"
      ><p v-for="line in data?.definitions" :key="line">{{ line }}</p></el-drawer
    >
  </section>
</template>
<style scoped>
.anomaly-overview-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  color: #183d71;
}
.anomaly-kpi-strip {
  margin-top: -59px;
}
</style>
