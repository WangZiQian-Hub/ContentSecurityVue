<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import type { ECharts, EChartsOption } from 'echarts'
import type { Distribution, ResourceSummary } from '../../../types/data-resource'
const props = withDefaults(
  defineProps<{
    kind: 'line' | 'donut' | 'radar'
    data?: Distribution[]
    trend?: ResourceSummary['trend']
    cumulative?: boolean
    centerText?: string
    height?: number
  }>(),
  { height: 245, centerText: '', data: () => [], trend: undefined },
)
const element = ref<HTMLDivElement>()
let chart: ECharts | undefined
let observer: ResizeObserver | undefined
let disposed = false
function option(): EChartsOption {
  const common = { color: ['#087bff', '#08c592', '#ffab40', '#9861ff', '#63a8ff'], tooltip: {textStyle: {fontSize: 18, },} }
  if (props.kind === 'donut')
    return {
      ...common,
      title: {
        text: props.centerText,
        subtext: '总数据量',
        left: '29%',  // 越大越向右
        top: '39%',  // 越大越向下
        textAlign: 'center',
        textStyle: { color: '#0a2c6b', fontSize: 26 },  // “12.56 TB”大小
        subtextStyle: { color: '#7c8799',
                        fontSize: 16,     // “总数据量”大小
                        lineHeight: 20,   // 与上方数值的距离
                      },
      },
      legend: {
        orient: 'vertical',
        right: '12%',  // 越大越向左
        top: 'center',
        itemGap: 20,  // 每一行之间的距离
        itemWidth: 35,      // 彩色色块宽度
        itemHeight: 22,     // 彩色色块高度
        textStyle: {color: '#333',
                    fontSize: 17,     // 图例文字大小
                    lineHeight: 25,
                  },
        formatter: (name: string) =>
          `${name}     ${props.data?.find((item) => item.name === name)?.value ?? 0}%`,
      },
      series: [
        {
          type: 'pie',
          center: ['30%', '50%'],  // 圆环位置：水平、垂直
          radius: ['60%', '90%'],  // 内半径、外半径
          label: { show: false },
          data: props.data,
        },
      ],
    }
  if (props.kind === 'radar')
    return {
      ...common,
      radar: {
        radius: '66%',
        indicator: props.data?.map((item) => ({ name: `${item.name}\n${item.value}`, max: 100 })),
        axisName: { color: '#51709d' },
        splitArea: { areaStyle: { color: ['#f8fbff', '#edf5ff'] } },
      },
      series: [
        {
          type: 'radar',
          data: [
            { value: props.data?.map((item) => item.value) ?? [], areaStyle: { opacity: 0.25 } },
          ],
        },
      ],
    }
  return {
    ...common,
    tooltip: { trigger: 'axis',axisPointer: {type: 'line', snap: true,}, textStyle: {fontSize: 17,},},
    legend: { top: -3, right: 8, textStyle: { color: '#334e78', fontSize: 16, },},
    grid: { left: 48, right: 24, bottom: 28, top: 42 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: props.trend?.dates.map((date) => date.slice(5)),
      axisLine: { lineStyle: { color: '#dce8f6' } },
      axisLabel: { color: '#647ea5', fontSize: 13.5, },
    },
    yAxis: {
      type: 'value',
      name: '数据量（GB）',
      nameTextStyle: { color: '#647ea5', fontSize: 15, fontWeight: 400,},
      splitLine: { lineStyle: { color: '#edf3fb' } },
      axisLabel: { color: '#647ea5', fontSize: 13.5, },
    },
    series: [
      {
        name: '新增数据量',
        type: 'line',
        data: props.trend?.added,
        symbolSize: 7,
        areaStyle: { opacity: 0.14 },
        label: { show: !props.cumulative, position: 'top', color: '#183d7b', fontSize: 13.5,},
      },
      ...(props.cumulative
        ? [
            {
              name: '累计数据量',
              type: 'line' as const,
              data: props.trend?.total,
              symbolSize: 7,
              areaStyle: { opacity: 0.15 },
            },
          ]
        : []),
    ],
  }
}
onMounted(async () => {
  const echarts = await import('echarts')
  if (disposed || !element.value) return
  chart = echarts.init(element.value)
  chart.setOption(option())
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(element.value)
})
watch(
  () => [props.data, props.trend, props.centerText, props.cumulative],
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
    :style="{ height: `${height}px`, width: '100%' }"
    role="img"
    :aria-label="
      kind === 'line' ? '数据接入趋势图' : kind === 'donut' ? '数据占比分布图' : '数据质量雷达图'
    "
  />
</template>
