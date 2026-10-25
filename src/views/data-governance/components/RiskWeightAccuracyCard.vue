<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from '../../../components/AppIcon.vue'
import { getRiskResultWeightAccuracy, getRiskWeightAccuracyOverview } from '../../../api/data-risk'
import { isMock } from '../../../api/request'
import { isGovernanceLlm } from '../../../api/governance-llm'
import type { RiskWeightAccuracy } from '../../../types/data-risk'

const props = defineProps<{ variant: 'overview' | 'result'; resultId?: string }>()
const data = ref<RiskWeightAccuracy>()
const loading = ref(false)
const failed = ref(false)
let generation = 0
const hasAccuracy = computed(
  () => data.value && data.value.totalCount > 0 && data.value.accuracyPercent !== null,
)
const percentage = computed(() => Math.min(100, Math.max(0, data.value?.accuracyPercent ?? 0)))
const explanation = computed(() => {
  const scope =
    props.variant === 'overview'
      ? '总体统计：每个数据集、固定版本和分级方案只纳入最新全语种检测结果。'
      : '当前检测批次统计，与已选结果对应，不随样本列表的筛选或分页变化。'
  return `${scope}准确率 = 判别正确的样本数 / 纳入评估的样本总数 × 100%。${isMock && !isGovernanceLlm ? '当前为模拟演示数据。' : ''}`
})
async function load() {
  const ticket = ++generation
  data.value = undefined
  failed.value = false
  loading.value = false
  if (props.variant === 'result' && !props.resultId) return
  loading.value = true
  try {
    const value =
      props.variant === 'overview'
        ? await getRiskWeightAccuracyOverview()
        : await getRiskResultWeightAccuracy(props.resultId!)
    if (ticket === generation) data.value = value
  } catch {
    if (ticket === generation) failed.value = true
  } finally {
    if (ticket === generation) loading.value = false
  }
}
watch(() => [props.variant, props.resultId], load, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => {
  generation++
})
</script>

<template>
  <article
    class="weight-accuracy"
    :class="
      variant === 'overview' ? 'kpi-card weight-accuracy--overview' : 'weight-accuracy--result'
    "
    :aria-busy="loading"
    :aria-label="variant === 'overview' ? '总体数据权重判别准确率' : '当前批次数据权重判别准确率'"
  >
    <div v-if="variant === 'overview'" class="weight-accuracy-icon" aria-hidden="true">
      <AppIcon name="Aim" />
    </div>
    <div class="weight-accuracy-content">
      <h3 class="weight-accuracy-title">
        数据权重判别准确率
        <el-tooltip :content="explanation" placement="top" :show-after="200">
          <button class="weight-accuracy-help" type="button" :aria-label="explanation">
            <AppIcon name="QuestionFilled" />
          </button>
        </el-tooltip>
      </h3>
      <div v-if="loading" class="weight-accuracy-status" role="status">加载中…</div>
      <div v-else-if="failed" class="weight-accuracy-status" role="status">
        统计暂不可用
        <button class="weight-accuracy-retry" type="button" @click="load">重试</button>
      </div>
      <div v-else-if="!hasAccuracy" class="weight-accuracy-status" role="status">暂无统计</div>
      <div v-else class="weight-accuracy-values">
        <strong class="weight-accuracy-percent">{{ percentage.toFixed(1) }}<small>%</small></strong>
        <div
          class="weight-accuracy-track"
          role="progressbar"
          aria-label="数据权重判别准确率"
          :aria-valuenow="percentage"
          :aria-valuetext="`${percentage.toFixed(1)}%`"
          :aria-valuemin="0"
          :aria-valuemax="100"
        >
          <div class="weight-accuracy-fill" :style="{ width: `${percentage}%` }"></div>
        </div>
        <p class="weight-accuracy-count">
          正确判别：{{ data!.correctCount.toLocaleString() }} /
          {{ data!.totalCount.toLocaleString() }}
        </p>
        <p v-if="data!.validCount != null && data!.validCount !== data!.totalCount" class="weight-accuracy-scope">
          分母为有标准档位标注的 {{ data!.totalCount.toLocaleString() }} 条 · 本范围有效检测共
          {{ data!.validCount.toLocaleString() }} 条
        </p>
      </div>
    </div>
  </article>
</template>

<style scoped>
.weight-accuracy {
  min-width: 0;
  border: 1px solid #d6e8fa;
  border-radius: 8px;
  background: linear-gradient(120deg, #fff, #f2f8ff);
  text-align: left;
}
.weight-accuracy--overview {
  display: flex;
  gap: 12px;
  padding: 18px 14px;
}
.weight-accuracy-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: #dff8ee;
  color: #00bd8b;
  font-size: 35px;
}
.weight-accuracy-content {
  flex: 1;
  min-width: 0;
}
.weight-accuracy .weight-accuracy-title {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 0 0 6px;
  color: #17315e;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.5;
  white-space: normal;
}
.weight-accuracy-help,
.weight-accuracy-retry {
  border: 0;
  padding: 0;
  background: transparent;
  color: #5675a0;
  cursor: pointer;
  font: inherit;
}
.weight-accuracy-help {
  display: inline-flex;
  flex-shrink: 0;
}
.weight-accuracy-values {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.weight-accuracy .weight-accuracy-percent {
  color: #082075;
  font-size: 27px;
  font-weight: 750;
  line-height: 1.1;
  white-space: nowrap;
}
.weight-accuracy .weight-accuracy-percent small {
  margin-left: 4px;
  font-size: 17px;
}
.weight-accuracy-track {
  height: 10px;
  overflow: hidden;
  border-radius: 4px;
  background: #dee7f3;
}
.weight-accuracy-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #08c894, #00b981);
  transition: width 0.25s ease;
}
.weight-accuracy .weight-accuracy-count {
  margin: 0;
  color: #6680a7;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.weight-accuracy .weight-accuracy-scope {
  margin: 2px 0 0;
  color: #8aa0bf;
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.weight-accuracy-status {
  min-height: 52px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #7187a5;
  font-size: 14px;
}
.weight-accuracy-retry {
  color: #087bff;
}
.weight-accuracy--result .weight-accuracy-title {
  color: #587398;
  font-size: 16px;
}
.weight-accuracy--result .weight-accuracy-values {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px 8px;
}
.weight-accuracy--result .weight-accuracy-track {
  order: -1;
  width: 100%;
}
.weight-accuracy--result .weight-accuracy-percent {
  color: #00b981;
  font-size: 24px;
}
</style>
