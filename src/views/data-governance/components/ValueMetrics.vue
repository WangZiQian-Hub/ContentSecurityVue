<script setup lang="ts">
import AppIcon from '../../../components/AppIcon.vue'
defineProps<{
  items: { label: string; value: number | null; unit: string; note: string; icon: string }[]
}>()
</script>
<template>
  <div class="value-metrics">
    <article v-for="(item, index) in items" :key="item.label">
      <div class="value-icon" :class="`tone-${index}`"><AppIcon :name="item.icon" /></div>
      <div>
        <h3>{{ item.label }}</h3>
        <strong
          >{{
            item.value === null
              ? '—'
              : item.value.toLocaleString('zh-CN', { maximumFractionDigits: 1 })
          }}
          <small>{{ item.unit }}</small></strong
        >
        <p>{{ item.note }}</p>
      </div>
    </article>
  </div>
</template>
<style scoped>
.value-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;
  margin-top: -15px;
}
article {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 16px;
  background: white;
  border: 1px solid #e1efff;
  border-radius: 8px;
  box-shadow: 0 3px 10px #157aff09;
  min-width: 0;
}
.value-icon {
  flex: 0 0 60px;
  height: 60px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #d7eaff;
  color: #087bff;
  font-size: 35px;
}
.tone-1 {
  background: #d1f8ec;
  color: #00b784;
}
.tone-3 {
  background: #e9deff;
  color: #8755ed;
}
h3 {
  margin: 0 0 5px;
  font-size: 18px;
  color: #173774;
}
strong {
  color: #082b83;
  font-size: 28px;
}
small {
  font-size: 16px;
}
p {
  margin: 5px 0 0;
  font-size: 14px;
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
