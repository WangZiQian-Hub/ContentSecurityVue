<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import type { ECharts, EChartsOption } from 'echarts'
const props = defineProps<{ option: EChartsOption; label: string }>()
const element = ref<HTMLElement>()
let chart: ECharts | undefined,
  observer: ResizeObserver | undefined,
  disposed = false
onMounted(async () => {
  const { init } = await import('echarts')
  if (disposed || !element.value) return
  chart = init(element.value)
  chart.setOption(props.option)
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(element.value)
})
watch(
  () => props.option,
  (value) => chart?.setOption(value, true),
  { deep: true },
)
onUnmounted(() => {
  disposed = true
  observer?.disconnect()
  chart?.dispose()
})
</script>
<template><div ref="element" class="ats-chart" role="img" :aria-label="label" /></template>
<style scoped>
.ats-chart {
  width: 100%;
  height: 210px;
  min-width: 0;
}
</style>
