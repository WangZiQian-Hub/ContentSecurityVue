<script setup lang="ts">
import { labels, stateType } from '../presentation'
defineProps<{
  state: string | null | undefined
  text?: string
  domain?: 'execution' | 'alert' | 'review'
}>()
</script>
<template>
  <el-tag
    :type="domain === 'alert' && state === 'pending' ? 'danger' : stateType(state)"
    effect="light"
    >{{
      text ||
      (state === 'pending' && domain === 'execution'
        ? '待启动'
        : state === 'pending' && domain === 'alert'
          ? '待处理'
          : labels[state || 'unknown']) ||
      state ||
      '未知'
    }}</el-tag
  >
</template>
