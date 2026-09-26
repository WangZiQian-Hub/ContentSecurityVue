<script setup lang="ts">
import { computed } from 'vue'
import type { Result } from '../../../types/data-risk'
const props = defineProps<{ result: Result; selected: string }>()
const emit = defineEmits<{ select: [level: string] }>()
// SVG 分段与可键盘操作的图例共用接口分布，零值不绘制伪扇区。
const segments = computed(() => {
  let offset = 0
  return props.result.levels.map((l) => {
    const length = props.result.riskCount ? (l.count / props.result.riskCount) * 100 : 0
    const segment = { ...l, length, offset }
    offset += length
    return segment
  })
})
</script>
<template>
  <div class="risk-donut">
    <svg viewBox="0 0 160 160" aria-label="按样本最高建议等级统计的风险分布">
      <circle cx="80" cy="80" r="60" fill="none" stroke="#edf3fc" stroke-width="23" />
      <circle
        v-for="s in segments.filter((s) => s.count)"
        :key="s.level"
        cx="80"
        cy="80"
        r="60"
        fill="none"
        :stroke="s.color"
        :stroke-width="selected === s.level ? 28 : 23"
        pathLength="100"
        :stroke-dasharray="`${s.length} ${100 - s.length}`"
        :stroke-dashoffset="-s.offset"
        transform="rotate(-90 80 80)"
        class="segment"
        role="button"
        tabindex="0"
        :aria-label="`${s.label} ${s.count} 条，点击筛选`"
        @click="emit('select', s.level)"
        @keydown.enter="emit('select', s.level)"
        @keydown.space.prevent="emit('select', s.level)"
      />
      <text x="80" y="79" text-anchor="middle" class="total">{{ result.riskCount }}</text>
      <text x="80" y="99" text-anchor="middle" class="caption">风险候选 / 条</text>
    </svg>
    <button
      v-for="s in segments"
      :key="s.level"
      :class="{ active: selected === s.level }"
      :aria-pressed="selected === s.level"
      @click="emit('select', s.level)"
    >
      <i :style="{ background: s.color }" /><span>{{ s.label }}</span
      ><b>{{ s.count }} 条</b><small>{{ s.percent.toFixed(1) }}%</small>
    </button>
  </div>
</template>
<style scoped>
.risk-donut svg {
  display: block;
  width: min(100%, 230px);
  margin: 0 auto 14px;
}
.segment {
  cursor: pointer;
  transition: stroke-width 0.15s;
}
.segment:hover {
  stroke-width: 28;
}
.total {
  font-size: 25px;
  font-weight: 700;
  fill: #123f82;
}
.caption {
  font-size: 9px;
  fill: #7185a5;
}
button {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 11px 8px;
  border: 0;
  background: transparent;
  color: #34527c;
  cursor: pointer;
  border-radius: 6px;
}
button.active,
button:hover {
  background: #eaf3ff;
}
i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}
b {
  margin-left: auto;
}
small {
  width: 46px;
  color: #8192b1;
  text-align: right;
}
</style>
