<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getRiskOverview } from '../../../api/data-risk'
import type { Overview } from '../../../types/data-risk'
import AppIcon from '../../../components/AppIcon.vue'
const data = ref<Overview>(),
  open = ref(false),
  error = ref('')
onMounted(async () => {
  try {
    data.value = await getRiskOverview()
  } catch (e) {
    error.value = String(e)
  }
})
</script>
<template>
  <section>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <div class="kpi-strip risk-overview">
      <button
        v-for="(card, i) in data?.cards"
        :key="card.label"
        class="kpi-card"
        @click="open = true"
      >
        <div class="kpi-icon" :class="`tone-${i}`"><AppIcon :name="card.icon" /></div>
        <div>
          <h3>{{ card.label }}</h3>
          <strong>{{ card.value.toLocaleString() }} <small>条</small></strong>
          <p>总体口径与纳入记录 ›</p>
        </div>
      </button>
    </div>
    <el-drawer v-model="open" title="总体统计口径与纳入记录" size="min(780px, 95vw)">
      <p v-for="line in data?.definitions" :key="line">{{ line }}</p>
      <el-table :data="data?.records"
        ><el-table-column prop="datasetName" label="数据集" /><el-table-column
          prop="versionId"
          label="固定版本" /><el-table-column prop="validCount" label="有效检测" /><el-table-column
          prop="riskCount"
          label="风险候选" /><el-table-column prop="finishedAt" label="完成时间" min-width="190"
      /></el-table>
    </el-drawer>
  </section>
</template>
<style scoped>
.risk-overview {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.risk-overview button {
  text-align: left;
  cursor: pointer;
  font: inherit;
  border: 1px solid #e7effa;
}
.risk-overview p {
  margin: 8px 0 0;
  font-size: 12px;
  color: #7d91b0;
}
@media (max-width: 1100px) {
  .risk-overview {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
