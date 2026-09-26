<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import type { ECharts, EChartsOption } from 'echarts'
const props = defineProps<{ option: EChartsOption; label: string }>()
const element = ref<HTMLDivElement>()
let chart: ECharts | undefined
let observer: ResizeObserver | undefined
let disposed = false
onMounted(async () => {
  const echarts = await import('echarts')
  if (disposed || !element.value) return
  chart = echarts.init(element.value)
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
<template><div ref="element" class="mw-chart" role="img" :aria-label="label" /></template>
