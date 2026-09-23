<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import type { ECharts, EChartsOption } from 'echarts'
const props = withDefaults(defineProps<{ kind?: string; height?: number }>(), {
  kind: 'line',
  height: 230,
})
const element = ref<HTMLDivElement>()
let chart: ECharts | undefined
let observer: ResizeObserver | undefined
let isDisposed = false
function getOption(): EChartsOption {
  const colors = ['#1677ff', '#12c397', '#9660ff', '#ffb23d', '#ff546f']
  if (props.kind === 'radar')
    return {
      color: colors,
      tooltip: {},
      radar: {
        radius: '65%',
        indicator: ['文化价值', '信息价值', '稀缺性', '可信度', '代表性'].map((name) => ({
          name,
          max: 100,
        })),
        axisName: { color: '#355486' },
        splitArea: { areaStyle: { color: ['#f5faff', '#edf5ff'] } },
      },
      series: [
        {
          type: 'radar',
          data: [{ value: [85, 78, 72, 88, 76], name: '当前数据集', areaStyle: { opacity: 0.22 } }],
        },
      ],
    }
  if (props.kind === 'donut')
    return {
      color: [colors[1]!, colors[4]!, colors[0]!],
      tooltip: { trigger: 'item' },
      legend: { right: 5, top: 'center', orient: 'vertical', textStyle: { color: '#40547e' } },
      title: {
        text: '92.3%',
        subtext: '综合通过率',
        left: '25%',
        top: '38%',
        textStyle: { fontSize: 25, color: '#092865' },
      },
      series: [
        {
          type: 'pie',
          radius: ['57%', '77%'],
          center: ['39%', '49%'],
          label: { show: false },
          data: [
            { value: 921, name: '通过  921' },
            { value: 59, name: '失败  59' },
            { value: 300, name: '运行中  300' },
          ],
        },
      ],
    }
  if (props.kind === 'heatmap')
    return {
      tooltip: {},
      grid: { left: 50, right: 40, top: 15, bottom: 35 },
      xAxis: { type: 'category', data: Array.from({ length: 24 }, (_, index) => index) },
      yAxis: { type: 'category', data: ['Layer 1', 'Layer 8', 'Layer 16', 'Layer 24', 'Layer 32'] },
      visualMap: {
        min: 0,
        max: 100,
        show: false,
        inRange: { color: ['#d7ecff', '#92beff', '#4b85ee', '#fa6076'] },
      },
      series: [
        {
          type: 'heatmap',
          data: Array.from({ length: 120 }, (_, index) => [
            index % 24,
            Math.floor(index / 24),
            (index * 37 + 13) % 101,
          ]),
        },
      ],
    }
  const isBar = props.kind === 'bar'
  return {
    color: colors,
    tooltip: { trigger: 'axis' },
    grid: { left: 42, right: 20, top: 35, bottom: 30 },
    legend: { right: 10, top: 0, textStyle: { color: '#617596' } },
    xAxis: {
      type: 'category',
      boundaryGap: isBar,
      data: isBar
        ? ['数据价值', '数据治理', '风险识别', '合规治理', '模型能力']
        : ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
      axisLine: { lineStyle: { color: '#d7e6f5' } },
      axisLabel: { color: '#637b9d', fontSize: 10 },
    },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#edf3fa' } } },
    series: isBar
      ? [
          {
            name: '指标通过率',
            type: 'bar',
            barWidth: '40%',
            data: [95.1, 90.3, 88.7, 93.6, 91.2],
            itemStyle: { borderRadius: [5, 5, 0, 0] },
          },
        ]
      : [
          {
            name: '训练损失',
            type: 'line',
            smooth: true,
            data: [9, 6.1, 4.7, 3.3, 2.8, 2.1, 1.8, 1.5, 1.2, 0.9, 0.7],
            areaStyle: { opacity: 0.07 },
          },
          {
            name: '验证损失',
            type: 'line',
            smooth: true,
            data: [7, 4, 2.8, 2, 1.6, 1.3, 1.1, 0.8, 0.6, 0.5, 0.3],
            itemStyle: { color: '#9660ff' },
          },
        ],
  }
}
onMounted(async () => {
  const echarts = await import('echarts')
  if (isDisposed || !element.value) return
  chart = echarts.init(element.value)
  chart.setOption(getOption())
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(element.value)
})
watch(
  () => props.kind,
  () => chart?.setOption(getOption(), true),
)
onUnmounted(() => {
  isDisposed = true
  observer?.disconnect()
  chart?.dispose()
})
</script>
<template>
  <div
    ref="element"
    :style="{ height: `${height}px`, width: '100%' }"
    role="img"
    :aria-label="`${kind} 示例统计图表`"
  ></div>
</template>
