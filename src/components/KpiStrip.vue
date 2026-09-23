<script setup lang="ts">
import { ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { getKpis } from '../api/kpi'
import type { Kpi } from '../types'

const props = defineProps<{ kind?: string }>()

const items = ref<Kpi[]>([])

function formatValue(value: number) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 10 }).format(value)
}

function formatChange(changeRate: number) {
  if (changeRate === 0) return '— 0%'
  return changeRate > 0 ? `↑ +${changeRate}%` : `↓ −${Math.abs(changeRate)}%`
}

watch(
  () => props.kind,
  async (kind) => {
    items.value = await getKpis(kind || 'dashboard')
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
