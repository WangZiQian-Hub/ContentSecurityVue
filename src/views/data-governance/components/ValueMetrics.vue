<script setup lang="ts">
// 指标条外观与"异常数据治理""风险识别与分级"两页保持一致：浅蓝底扁平格子，不再使用圆形图标。
defineProps<{
  items: { label: string; value: number | null; unit: string; note: string; icon: string }[]
}>()
</script>
<template>
  <div class="value-metrics">
    <div v-for="item in items" :key="item.label">
      <span>{{ item.label }}</span>
      <strong
        >{{
          item.value === null
            ? '—'
            : item.value.toLocaleString('zh-CN', { maximumFractionDigits: 1 })
        }}
        <small>{{ item.unit }}</small></strong
      >
      <p v-if="item.value !== null">{{ item.note }}</p>
    </div>
  </div>
</template>
<style scoped>
.value-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}
.value-metrics > div {
  min-width: 0;
  border-radius: 7px;
  background: #f4f8fe;
  border: 1px solid #e7effb;
  padding: 15px 20px;
  text-align: left;
  color: #587398;
  font: inherit;
}
.value-metrics span {
  display: inline;
  font-size: 16px;
  font-weight: 700;
}
.value-metrics strong {
  display: block;
  margin-top: 5px;
  font-size: 28px;
  color: #113d7c;
}
.value-metrics small {
  margin-left: 7px;
  font-size: 16px;
  font-weight: 700;
}
.value-metrics p {
  margin: 6px 0 0;
  font-size: 13px;
  font-weight: 400;
  color: #6e85ab;
  line-height: 1.5;
}
@media (max-width: 1100px) {
  .value-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 650px) {
  .value-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
