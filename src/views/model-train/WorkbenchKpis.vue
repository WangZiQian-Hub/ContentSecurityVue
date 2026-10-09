<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../../components/AppIcon.vue'
const props = defineProps<{
  items: { label: string; value: string | number; unit?: string; icon: string }[]
}>()
/* 卡片外观直接复用共享样式（styles/shared-components.css 的 kpi-strip / kpi-card），
   与“数据治理”等页面的 KPI 卡片保持同一尺寸和文字层级；
   列数与 KpiStrip 一致，由指标数量决定，避免换页时卡片宽度跳动。 */
const columns = computed(() => `repeat(${props.items.length || 1}, minmax(0, 1fr))`)
</script>
<template>
  <div class="kpi-strip" :style="{ gridTemplateColumns: columns }">
    <article v-for="(item, index) in items" :key="item.label" class="kpi-card">
      <div class="kpi-icon" :class="`tone-${index % 6}`"><AppIcon :name="item.icon" /></div>
      <div>
        <h3>{{ item.label }}</h3>
        <strong
          >{{ item.value }} <small>{{ item.unit }}</small></strong
        >
      </div>
      <!-- 右下角装饰柱形：与数据治理页面一致，仅作装饰，不代表真实统计数据。 -->
      <div class="mini-bars" aria-hidden="true">
        <i v-for="bar in 5" :key="bar" :style="{ height: `${bar * 6 + 6}px` }"></i>
      </div>
    </article>
  </div>
</template>
