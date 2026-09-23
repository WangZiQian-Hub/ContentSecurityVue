<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import KpiStrip from '../../components/KpiStrip.vue'
import PanelCard from '../../components/PanelCard.vue'
import CapabilityForm from '../../components/CapabilityForm.vue'
import DataChart from '../../components/DataChart.vue'
import ResourceTable from '../../components/ResourceTable.vue'
const route = useRoute()
const capability = computed(
  () =>
    ({
      'value-analysis': 'value_score',
      anomaly: 'anomaly_detect',
      'risk-classification': 'semantic_risk',
      quality: 'value_score',
    })[String(route.params.tab)] || 'anomaly_detect',
)
</script>
<template>
  <KpiStrip kind="governance" />
  <div class="grid governance-grid">
    <PanelCard title="数据处理控制台" icon="VideoPlay"
      ><CapabilityForm :key="capability" :capability="capability" title="开始处理" /></PanelCard
    ><PanelCard title="数据价值分析" icon="DataAnalysis" link="/data-governance/value-analysis"
      ><DataChart kind="radar" :height="270" />
      <div class="legend-note">● 当前数据集 <span>● 行业参考</span></div></PanelCard
    ><PanelCard title="异常数据治理" icon="Checked" link="/data-governance/anomaly"
      ><DataChart kind="donut" :height="215" />
      <div class="quality-row">
        <span>重复数据 <b>42.3%</b></span
        ><span>低质量噪声 <b>28.1%</b></span
        ><span>敏感违规 <b>15.6%</b></span>
      </div></PanelCard
    >
  </div>
  <div class="grid two">
    <PanelCard
      title="风险识别与分级"
      icon="WarningFilled"
      link="/data-governance/risk-classification"
      ><ResourceTable resource="alerts" /></PanelCard
    ><PanelCard title="数据质量评估" icon="PieChart" link="/data-governance/quality"
      ><div class="quality-grid">
        <div v-for="(name, index) in ['完整性', '一致性', '规范性', '可靠性']" :key="name">
          <span>{{ name }}</span
          ><strong>{{ [96.8, 94.1, 92.6, 95.3][index] }}<small> %</small></strong>
          <p class="positive">↑ +1.2%</p>
        </div>
      </div></PanelCard
    >
  </div>
</template>
