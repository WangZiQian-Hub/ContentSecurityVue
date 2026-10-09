<script setup lang="ts">
/* 结果区的小节外壳：统一标题样式。
   wide 用于时间轴、答复这类需要占满整行的小节（在双列栅格里跨列）。 */
defineProps<{ title: string; note?: string; wide?: boolean }>()
</script>
<template>
  <section class="result-section" :class="{ wide }">
    <h4>
      <span class="bar"></span>{{ title }}<small v-if="note">{{ note }}</small>
    </h4>
    <slot />
  </section>
</template>
<style scoped>
.result-section {
  min-width: 0;
}
.result-section.wide {
  grid-column: 1 / -1;
}
h4 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: #2c3a4f;
}
.bar {
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: #2b6cf6;
}
h4 small {
  font-size: 12px;
  font-weight: 400;
  color: #96a1b3;
}
</style>
