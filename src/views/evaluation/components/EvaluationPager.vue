<script setup lang="ts">
defineProps<{ total: number; page: number; pageSize?: number }>()
defineEmits<{ change: [page: number] }>()
</script>
<template>
  <div class="ev-pagination">
    <span>共 {{ total }} 条记录</span
    ><el-pagination
      background
      layout="prev, pager, next"
      :page-size="pageSize || 10"
      :total="total"
      :current-page="page"
      @current-change="$emit('change', $event)"
    />
  </div>
</template>
