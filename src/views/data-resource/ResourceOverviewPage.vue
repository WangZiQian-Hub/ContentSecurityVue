// “数据资源” 总览主页面
<script setup lang="ts">
import { computed, ref } from 'vue'
import PanelCard from '../../components/PanelCard.vue'
import ResourceChart from './components/ResourceChart.vue'
import DistributionBars from './components/DistributionBars.vue'
import IngestTaskTable from './components/IngestTaskTable.vue'
import { useDataResourceStore } from '../../stores/data-resource'
const store = useDataResourceStore()
const days = ref(7)
const trend = computed(() => {
  const data = store.summary?.trend
  return data
    ? {
        dates: data.dates.slice(-days.value),
        added: data.added.slice(-days.value),
        total: data.total.slice(-days.value),
      }
    : undefined
})
</script>
<template>
  <div class="resource-overview-top">
    <PanelCard title="数据接入趋势" icon="TrendCharts"
      ><template #extra
        ><el-select
          v-model="days"
          class="trend-days-select"
          popper-class="trend-days-popper"
          style="width: 120px"
          aria-label="趋势时间范围"
          ><el-option label="最近7天" :value="7" /><el-option
            label="最近3天"
            :value="3" /></el-select></template
      ><ResourceChart kind="line" :trend="trend"
    /></PanelCard>
    <PanelCard title="数据类型分布" icon="PieChart"
      ><ResourceChart
        kind="donut"
        :data="store.summary?.modalities"
        :center-text="`${store.summary?.kpis.find((item) => item.id === 'storage')?.value ?? '—'} TB`"
    /></PanelCard>
  </div>
  <div class="resource-overview-bottom">
    <PanelCard title="最近接入任务" icon="List" link="/data-resource/ingest"
      ><IngestTaskTable compact
    /></PanelCard>
    <PanelCard title="语言分布" icon="Location"
      ><DistributionBars :data="store.summary?.languages ?? []"
    /></PanelCard>
  </div>
</template>
