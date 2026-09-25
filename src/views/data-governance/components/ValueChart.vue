<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import type { ECharts, EChartsOption } from 'echarts'
import type { ValueResult } from '../../../types/data-value'
const props = defineProps<{ kind: 'radar' | 'bar'; result: ValueResult }>()
const emit = defineEmits<{ selectBin: [id: string] }>()
const element = ref<HTMLDivElement>()
let chart: ECharts | undefined
let observer: ResizeObserver | undefined
let disposed = false
function option(): EChartsOption {
  if (props.kind === 'radar')
    return {
      color: ['#087bff'],
      tooltip: {},
      radar: {
        radius: '62%',
        indicator: props.result.dimensions.map((item) => ({
          name: `${item.name}\n${item.score}`,
          max: 100,
        })),
        axisName: { color: '#244c94', fontSize: 13 },
        splitArea: { areaStyle: { color: ['#f5faff', '#e7f2ff'] } },
      },
      series: [
        {
          type: 'radar',
          data: [
            {
              value: props.result.dimensions.map((item) => item.score),
              name: '当前范围均值',
              areaStyle: { opacity: 0.25 },
            },
          ],
        },
      ],
    }
  return {
    color: ['#087bff'],
    tooltip: { trigger: 'axis' },
    grid: { left: 45, right: 14, top: 38, bottom: 32 },
    xAxis: {
      type: 'category',
      data: props.result.bins.map((item) => item.label),
      axisLabel: { fontSize: 12, interval: 0 },
      axisLine: { lineStyle: { color: '#9fbbe0' } },
    },
    yAxis: {
      type: 'value',
      name: '样本数',
      minInterval: 1,
      splitLine: { lineStyle: { color: '#edf3fb' } },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 38,
        data: props.result.bins.map((item) => item.count),
        label: { show: true, position: 'top', color: '#087bff' },
        itemStyle: { borderRadius: [4, 4, 0, 0] },
      },
    ],
  }
}
onMounted(async () => {
  const echarts = await import('echarts')
  if (disposed || !element.value) return
  chart = echarts.init(element.value)
  chart.setOption(option())
  chart.on('click', (event) => {
    if (props.kind === 'bar' && typeof event.dataIndex === 'number')
      emit('selectBin', props.result.bins[event.dataIndex]!.id)
  })
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(element.value)
})
watch(
  () => props.result,
  () => chart?.setOption(option(), true),
  { deep: true },
)
onUnmounted(() => {
  disposed = true
  observer?.disconnect()
  chart?.dispose()
})
</script>
<template>
  <div
    ref="element"
    class="value-chart"
    role="img"
    :aria-label="
      kind === 'radar' ? '当前分析结果五维价值画像' : '综合价值分数分布，点击柱形可筛选明细'
    "
  />
</template>
<style scoped>
.value-chart {
  width: 100%;
  height: 255px;
}
</style>
