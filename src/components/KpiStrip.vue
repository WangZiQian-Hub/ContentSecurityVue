// “一整排KPI卡片” 组件
<script setup lang="ts">
import { ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { getKpis } from '../api/kpi'
import type { Kpi } from '../types'

const props = defineProps<{ kind?: string }>()

//items 必须是数组，数组中的每一项都必须符合Kpi接口
const items = ref<Kpi[]>([])

// 返回数值
function formatValue(value: number) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 10 }).format(value)
}

// 返回增长率
function formatChange(changeRate: number) {
  if (changeRate === 0) return '— 0%'
  return changeRate > 0 ? `↑ +${changeRate}%` : `↓ −${Math.abs(changeRate)}%`
}

//KPI组件监听变化
watch(
  () => props.kind,
  async (kind, _previousKind, onCleanup) => {
    // 切换页签后忽略旧请求，避免上一页的卡片覆盖当前页。
    let isCurrent = true
    onCleanup(() => {
      isCurrent = false
    })
    items.value = []
    try {
      const data = await getKpis(kind || 'dashboard')
      if (isCurrent) items.value = data
    } catch {
      // 请求层已显示错误；不保留上一页的指标。
      if (isCurrent) items.value = []
    }
  },
  { immediate: true },
)
</script>
<template>
  <div
    class="kpi-strip"
    :style="{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }"
  >
    <article v-for="(item, index) in items" :key="item.id" class="kpi-card">
      <div class="kpi-icon" :class="`tone-${index % 6}`"><AppIcon :name="item.icon" /></div>
      <div>
        <h3>{{ item.label }}</h3>
        <strong
          >{{ formatValue(item.value) }} <small>{{ item.unit }}</small></strong
        >
        <p :class="item.changeRate < 0 ? 'positive' : 'increase'">
          {{ formatChange(item.changeRate) }}
        </p>
      </div>
      <div class="mini-bars" aria-hidden="true">
        <i v-for="bar in 5" :key="bar" :style="{ height: `${bar * 6 + 6}px` }"></i>
      </div>
    </article>
  </div>
</template>
