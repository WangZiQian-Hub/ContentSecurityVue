<script setup lang="ts">
defineProps<{ message: string; issue: string; canRetry: boolean; hasResult: boolean }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div v-if="message || issue" role="status">
    <el-alert :title="issue || message" :type="issue ? 'warning' : 'info'" :closable="false">
      <span v-if="hasResult">下方仍显示先前保存的结果。</span>
      <el-button v-if="canRetry" link type="primary" @click="$emit('retry')">重试查询</el-button>
      <slot />
    </el-alert>
  </div>
</template>
