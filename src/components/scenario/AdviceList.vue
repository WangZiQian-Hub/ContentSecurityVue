<script setup lang="ts">
/* 纯字符串建议列表：recommendations 与四类场景建议（communication_advice 等）共用。
   不渲染空占位，空数组由调用方决定是否隐藏整个小节。 */
defineProps<{ items: string[] }>()
</script>
<template>
  <ul v-if="items?.length" class="advice-list">
    <li v-for="(item, index) in items" :key="index">{{ item }}</li>
  </ul>
  <p v-else class="empty">无</p>
</template>
<style scoped>
.advice-list {
  list-style: none;
  margin: 0;
}
.advice-list li {
  position: relative;
  padding: 6px 0 6px 18px;
  border-bottom: 1px dashed #eef1f6;
  font-size: 13.5px;
  line-height: 1.7;
  color: #2c3a4f;
}
.advice-list li:last-child {
  border-bottom: 0;
}
.advice-list li::before {
  content: '';
  position: absolute;
  left: 3px;
  top: 15px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #9db9ea;
}
.empty {
  margin: 0;
  font-size: 13px;
  color: #96a1b3;
}
</style>
