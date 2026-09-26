<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getAnomalyOverview } from '../../../api/data-anomaly'
import type { Overview } from '../../../types/data-anomaly'
import AppIcon from '../../../components/AppIcon.vue'
const data = ref<Overview>()
const open = ref(false)
const error = ref('')
onMounted(async () => {
  try {
    data.value = await getAnomalyOverview()
  } catch (e) {
    error.value = String(e)
  }
})
</script>
<template>
  <section>
    <div class="anomaly-overview-title">
      <b>总体概览 · 当前可访问数据集</b
      ><el-button link type="primary" @click="open = true">统计口径 ›</el-button>
    </div>
    <el-alert v-if="error" :title="error" type="error" />
    <div class="kpi-strip" style="grid-template-columns: repeat(4, minmax(0, 1fr))">
      <article v-for="card in data?.cards" :key="card.label" class="kpi-card">
        <div class="kpi-icon tone-0"><AppIcon :name="card.icon" /></div>
        <div>
          <h3>{{ card.label }}</h3>
          <strong>{{ card.value.toLocaleString() }} <small>条</small></strong>
        </div>
      </article>
    </div>
    <el-drawer v-model="open" title="总体统计口径"
      ><p v-for="line in data?.definitions" :key="line">{{ line }}</p></el-drawer
    >
  </section>
</template>
<style scoped>
.anomaly-overview-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  color: #183d71;
}
</style>
