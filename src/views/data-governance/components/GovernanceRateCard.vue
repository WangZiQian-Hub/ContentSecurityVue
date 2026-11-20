<script setup lang="ts">
import AppIcon from '../../../components/AppIcon.vue'

defineProps<{
  variant: 'overview' | 'result'
  title: string
  explanation: string
  percentage: number | null
  counts?: { correctCount: number; totalCount: number }
  countLabel: string
  scopeNote?: string
  loading?: boolean
  failed?: boolean
}>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <article
    class="weight-accuracy"
    :class="
      variant === 'overview' ? 'kpi-card weight-accuracy--overview' : 'weight-accuracy--result'
    "
    :aria-busy="loading || false"
    :aria-label="`${variant === 'overview' ? '总体' : '当前批次'}${title}`"
  >
    <div v-if="variant === 'overview'" class="weight-accuracy-icon" aria-hidden="true">
      <AppIcon name="Aim" />
    </div>
    <div class="weight-accuracy-content">
      <h3 class="weight-accuracy-title">
        {{ title }}
        <el-tooltip
          :content="explanation"
          placement="top"
          :show-after="200"
          :popper-style="{ maxWidth: '420px', whiteSpace: 'pre-line', lineHeight: '1.6' }"
        >
          <button class="weight-accuracy-help" type="button" :aria-label="explanation">
            <AppIcon name="QuestionFilled" />
          </button>
        </el-tooltip>
      </h3>
      <div v-if="loading" class="weight-accuracy-status" role="status">加载中…</div>
      <div v-else-if="failed" class="weight-accuracy-status" role="status">
        统计暂不可用
        <button class="weight-accuracy-retry" type="button" @click="$emit('retry')">重试</button>
      </div>
      <div v-else-if="percentage === null || !counts" class="weight-accuracy-status" role="status">
        暂无统计
      </div>
      <div v-else class="weight-accuracy-values">
        <strong class="weight-accuracy-percent">{{ percentage.toFixed(1) }}<small>%</small></strong>
        <div
          class="weight-accuracy-track"
          role="progressbar"
          :aria-label="title"
          :aria-valuenow="percentage"
          :aria-valuetext="`${percentage.toFixed(1)}%`"
          :aria-valuemin="0"
          :aria-valuemax="100"
        >
          <div class="weight-accuracy-fill" :style="{ width: `${percentage}%` }"></div>
        </div>
        <p class="weight-accuracy-count">
          {{ countLabel }}：{{ counts.correctCount.toLocaleString() }} /
          {{ counts.totalCount.toLocaleString() }}
        </p>
        <p v-if="scopeNote" class="weight-accuracy-scope">{{ scopeNote }}</p>
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
