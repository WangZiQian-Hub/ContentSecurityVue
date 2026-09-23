<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import KpiStrip from '../../components/KpiStrip.vue'
import PanelCard from '../../components/PanelCard.vue'
import CapabilityForm from '../../components/CapabilityForm.vue'
import DataChart from '../../components/DataChart.vue'
import TaskTable from '../../components/TaskTable.vue'
import { navigation } from '../../router/navigation'
const route = useRoute()
const name = computed(
  () =>
    navigation
      .find((item) => item.path === '/scenario')
      ?.tabs.find((tab) => tab.path === route.params.tab)?.title || '舆情分析',
)
</script>
<template>
  <KpiStrip kind="governance" />
  <div class="scenario-banner">
    <span>SCENARIO APPLICATION</span>
    <h2>{{ name }} · 内容安全治理工作台</h2>
    <p>融合数据分析、风险识别与合规干预，为行业场景提供一体化安全能力。</p>
  </div>
  <div class="grid three">
    <PanelCard :title="`${name}验证`" icon="ChatDotRound"
      ><CapabilityForm
        :key="name"
        capability="scenario_governance"
        :scenario-code="String(route.params.tab || 'public-opinion').replaceAll('-', '_')"
        title="开始场景分析"
        text-input /></PanelCard
    ><PanelCard title="场景风险分布" icon="PieChart"
      ><DataChart kind="donut" :height="300" /></PanelCard
    ><PanelCard title="场景能力评估" icon="DataAnalysis"
      ><DataChart kind="radar" :height="300"
    /></PanelCard>
  </div>
  <PanelCard title="场景治理任务" icon="Tickets"><TaskTable /></PanelCard>
</template>
