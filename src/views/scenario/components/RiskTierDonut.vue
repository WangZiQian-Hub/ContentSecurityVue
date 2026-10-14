<script setup lang="ts">
/** 风险分层环形图：四档数量；悬停或点击扇区时，中心显示该档位的数量与名称。
 *  默认显示「中风险」（与效果图一致：中心 412 当前样本 中风险）。 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import type { ECharts, EChartsOption } from 'echarts'
import {
  multilingualRiskLevels,
  riskLevelColors,
  type MultilingualRiskLevel,
  type RiskDistributionItem,
} from '../../../types/ethnic-multilingual'

const props = defineProps<{ items: RiskDistributionItem[] }>()
const element = ref<HTMLDivElement>()
let chart: ECharts | undefined
let observer: ResizeObserver | undefined
let disposed = false

/** 当前中心展示的档位，默认中风险（效果图中心为 412 中风险）。 */
const centerLevel = ref<MultilingualRiskLevel>('medium')
const centerCount = ref(0)

function itemOf(level: MultilingualRiskLevel): RiskDistributionItem | undefined {
  return props.items.find((item) => item.level === level)
}

function syncCenter(level: MultilingualRiskLevel) {
  const item = itemOf(level)
  if (item) {
    centerLevel.value = level
    centerCount.value = item.count
  }
}

function buildOption(): EChartsOption {
  return {
    tooltip: { show: false },
    series: [
      {
        type: 'pie',
        radius: ['62%', '84%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: true,
        label: { show: false },
        labelLine: { show: false },
        emphasis: { scale: true, scaleSize: 5 },
        data: props.items.map((item) => ({
          value: item.count,
          name: item.level,
          itemStyle: {
            color: riskLevelColors[item.level as Exclude<MultilingualRiskLevel, 'unknown'>],
          },
        })),
      },
    ],
  }
}

onMounted(async () => {
  const echarts = await import('echarts')
  if (disposed || !element.value) return
  chart = echarts.init(element.value)
  chart.setOption(buildOption())
  // 悬停扇区时更新中心；移出恢复默认中风险。
  chart.on('mouseover', (params) => {
    if (typeof params.name === 'string')
      syncCenter(params.name as MultilingualRiskLevel)
  })
  chart.on('mouseout', () => syncCenter('medium'))
  chart.on('click', (params) => {
    if (typeof params.name === 'string')
      syncCenter(params.name as MultilingualRiskLevel)
  })
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(element.value)
  syncCenter('medium')
})

watch(
  () => props.items,
  () => {
    chart?.setOption(buildOption(), true)
    syncCenter(centerLevel.value)
  },
  { deep: true },
)

onUnmounted(() => {
  disposed = true
  observer?.disconnect()
  chart?.dispose()
})
</script>

<template>
  <div class="donut-wrap">
    <div ref="element" class="donut" role="img" aria-label="风险分层结果环形图" />
    <div class="donut-center">
      <strong>{{ centerCount }}</strong>
      <span>当前样本</span>
      <em>{{ multilingualRiskLevels[centerLevel] }}</em>
    </div>
  </div>
</template>

<style scoped>
.donut-wrap {
  position: relative;
  width: 150px;
  height: 150px;
  flex: 0 0 auto;
}
.donut {
  width: 100%;
  height: 100%;
}
.donut-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  line-height: 1.2;
}
.donut-center strong {
  font-size: 24px;
  color: #092865;
}
.donut-center span {
  margin-top: 2px;
  font-size: 11px;
  color: #8a97ad;
}
.donut-center em {
  font-style: normal;
  font-size: 12px;
  font-weight: 600;
  color: #f59e0b;
}
</style>
