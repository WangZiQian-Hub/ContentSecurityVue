<script setup lang="ts">
import { computed } from 'vue'
import { label } from '../presentation'
const props = defineProps<{ value?: string | null; judgment?: boolean }>()
const tone = computed(() =>
  ['passed', 'succeeded', 'published', 'complete', 'enabled', 'success'].includes(props.value || '')
    ? 'success'
    : ['failed', 'corrupt', 'failure'].includes(props.value || '')
      ? 'danger'
      : ['needs_definition', 'inconclusive', 'incomplete'].includes(props.value || '')
        ? 'warning'
        : ['running', 'queued'].includes(props.value || '')
          ? 'primary'
          : 'info',
)
</script>
<template>
  <el-tag :type="tone" effect="light" round>{{
    judgment && value === 'failed' ? '未达标' : label(value)
  }}</el-tag>
</template>
