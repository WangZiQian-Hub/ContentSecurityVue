<script setup lang="ts">
import type { Distribution } from '../../../types/data-resource'
defineProps<{ data: Distribution[] }>()
const colors = ['#087bff', '#08c592', '#ffab40', '#9861ff', '#63a8ff']
</script>
<template>
  <div class="resource-bars">
    <div v-for="(item, index) in data" :key="item.name" class="resource-bar-row">
      <span>{{ item.name }}</span
      ><el-progress
        :percentage="item.value"
        :show-text="false"
        :stroke-width="16"
        :color="colors[index % colors.length]"
      /><span>{{ item.value }}%</span>
    </div>
  </div>
</template>
