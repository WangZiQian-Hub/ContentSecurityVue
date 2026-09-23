/** 统一图标组件 */

<script setup lang="ts">
import * as icons from '@element-plus/icons-vue'
import { computed } from 'vue'
const props = defineProps<{ name?: string }>()
const icon = computed(
  () => icons[(props.name || 'DataAnalysis') as keyof typeof icons] || icons.DataAnalysis,
)
</script>
<template>
  <el-icon
    ><svg v-if="name === 'Shield'" viewBox="0 0 24 24" fill="none">
      <path d="M12 2 21 5v6c0 5-4 9-9 11C7 20 3 16 3 11V5l9-3Z" fill="currentColor" opacity=".25" />
      <path
        d="m12 2 9 3v6c0 5-4 9-9 11C7 20 3 16 3 11V5l9-3Z"
        stroke="currentColor"
        stroke-width="2"
      />
      <path
        d="m8 11 3 3 5-6"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      /></svg
    ><component :is="icon" v-else
  /></el-icon>
</template>
