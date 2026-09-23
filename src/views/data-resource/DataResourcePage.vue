<script setup lang="ts">
import KpiStrip from '../../components/KpiStrip.vue'
import PanelCard from '../../components/PanelCard.vue'
import ResourceTable from '../../components/ResourceTable.vue'
import CapabilityForm from '../../components/CapabilityForm.vue'
import DataChart from '../../components/DataChart.vue'
import { useRoute } from 'vue-router'
const route = useRoute()
</script>
<template>
  <KpiStrip kind="resource" />
  <div class="grid resource-grid">
    <PanelCard title="数据集管理" icon="Coin"
      ><ResourceTable resource="datasets" searchable /></PanelCard
    ><PanelCard
      :title="route.params.tab === 'statistics' ? '数据资源统计' : '数据接入'"
      icon="UploadFilled"
      ><DataChart
        v-if="route.params.tab === 'statistics'"
        kind="bar"
        :height="300" /><CapabilityForm
        v-else
        capability="data_ingest"
        title="创建数据接入任务"
        text-input
    /></PanelCard>
  </div>
  <div class="grid two">
    <PanelCard title="数据质量分布" icon="PieChart"><DataChart kind="donut" /></PanelCard
    ><PanelCard title="数据价值维度" icon="DataAnalysis"><DataChart kind="radar" /></PanelCard>
  </div>
</template>
