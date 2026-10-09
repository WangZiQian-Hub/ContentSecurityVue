// “一整排KPI卡片” 组件
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { getKpis } from '../api/kpi'
import type { Kpi } from '../types'

const props = defineProps<{
  kind?: string
  comparisonLabel?: string
  snapshotItems?: Kpi[]
  hideMiniBarsWithoutComparison?: boolean
  hideComparison?: boolean
  titleDescriptions?: Record<string, string>
  /** 接口没返回指标时显示的占位文案；不传则维持原样（整块不显示内容）。 */
  emptyText?: string
  /** 占位文案下面的一行小字；不传则只显示上面那行。 */
  emptyHint?: string
  /** 后端没给可用对比数字时的说明文案，避免卡片出现 NaN。 */
  noComparisonText?: string
}>()

//items 必须是数组，数组中的每一项都必须符合Kpi接口
const items = ref<Kpi[]>([])
// 请求进行中不显示“暂无数据”，否则每次进页面都会先闪一下占位。
const loading = ref(false)

// 返回数值
function formatValue(value: number) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 10 }).format(value)
}

// 返回增长率
function formatChange(changeRate: number) {
  if (changeRate === 0) return '— 0%'
  return changeRate > 0 ? `↑ +${changeRate}%` : `↓ −${Math.abs(changeRate)}%`
}

// 卡片有没有拿到能用的对比数字；后端漏传该字段时 Number.isFinite 为 false。
function hasComparison(item: Kpi) {
  return Number.isFinite(item.changeRate)
}

// 对比区文案：没有对比数据时给一句说明，而不是 NaN 或空白。
function comparisonText(item: Kpi) {
  return hasComparison(item)
    ? formatChange(item.changeRate)
    : props.noComparisonText || '暂无对比数据'
}

// 对比区颜色：涨红、跌绿；没有对比数据用中性灰。
function comparisonClass(item: Kpi) {
  if (!hasComparison(item)) return 'no-comparison'
  return item.changeRate < 0 ? 'positive' : 'increase'
}

// 没有对比数据时不画装饰柱形，避免看着像有趋势。
function showMiniBars(item: Kpi) {
  if (!hasComparison(item)) return false
  return !props.hideMiniBarsWithoutComparison || !props.comparisonLabel
}

// 没有指标、且调用方给了占位文案时，显示占位而不是一整片空白。
const showEmpty = computed(
  () => !loading.value && items.value.length === 0 && Boolean(props.emptyText),
)

//KPI组件监听变化
watch(
  () => [props.kind, props.snapshotItems] as const,
  async ([kind, provided], _previousKind, onCleanup) => {
    // 切换页签后忽略旧请求，避免上一页的卡片覆盖当前页。
    let isCurrent = true
    onCleanup(() => {
      isCurrent = false
    })
    items.value = []
    if (provided !== undefined) { items.value = provided; loading.value = false; return }
    loading.value = true
    try {
      const data = await getKpis(kind || 'dashboard')
      if (isCurrent) items.value = data
    } catch {
      // 请求层已显示错误；不保留上一页的指标。
      if (isCurrent) items.value = []
    } finally {
      if (isCurrent) loading.value = false
    }
  },
  { immediate: true },
)
</script>
<template>
  <div
    class="kpi-strip"
    :style="{
      gridTemplateColumns: items.length ? `repeat(${items.length}, minmax(0, 1fr))` : '1fr',
    }"
  >
    <!-- 没拿到指标时给一句说明，避免整排卡片直接消失。 -->
    <div v-if="showEmpty" class="kpi-empty">
      <strong>{{ emptyText }}</strong>
      <small v-if="emptyHint">{{ emptyHint }}</small>
    </div>
    <article v-for="(item, index) in items" :key="item.id" class="kpi-card">
      <div class="kpi-icon" :class="`tone-${index % 6}`"><AppIcon :name="item.icon" /></div>
      <div>
        <h3 :title="titleDescriptions?.[item.id]">{{ item.label }}</h3>
        <strong
          ><slot name="value" :item="item" :items="items"
            >{{ item.displayValue ?? formatValue(item.value) }} <small>{{ item.unit }}</small></slot
          ></strong
        >
        <slot v-if="!hideComparison" name="comparison" :item="item">
          <p v-if="comparisonLabel">{{ comparisonLabel }}</p>
          <p v-else :class="comparisonClass(item)">
            {{ comparisonText(item) }}
          </p>
        </slot>
      </div>
      <div v-if="showMiniBars(item)" class="mini-bars" aria-hidden="true">
        <i v-for="bar in 5" :key="bar" :style="{ height: `${bar * 6 + 6}px` }"></i>
      </div>
    </article>
  </div>
</template>
