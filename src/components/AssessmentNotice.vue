<script setup lang="ts">
import { computed } from 'vue'
import { assessmentLabel, type Assessment } from '../types/assessment'
const props = defineProps<{ value?: Assessment | null }>()
const label = computed(() => assessmentLabel(props.value))
</script>
<template>
  <div v-if="label" role="status" class="assessment-notice" :class="value?.assessmentStatus">
    <strong>{{ label }}</strong>
    <span v-if="value?.assessmentStatus !== 'assessed'">
      {{ value?.assessmentReason || '资料不足，无法判断' }}。无法判断的数值以 0 占位，不计入有效评分。
    </span>
  </div>
</template>
<style scoped>
.assessment-notice { margin: 10px 0; padding: 10px 14px; border: 1px solid #dce7f7; border-radius: 6px; background: #f3f8ff; color: #315c91; }
.assessment-notice span { margin-left: 12px; }
.assessment-notice.unavailable, .assessment-notice.partial { background: #fff8eb; border-color: #f1dcae; color: #8a6019; }
</style>
