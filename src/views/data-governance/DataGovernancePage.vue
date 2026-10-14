// “数据治理” 页面
<script setup lang="ts">
import KpiStrip from '../../components/KpiStrip.vue'
import AppIcon from '../../components/AppIcon.vue'
import { navigation } from '../../router/navigation'
import { PROCESS_KIND } from '../../types/data-governance'
import { useRoute } from 'vue-router'
import { ref } from 'vue'
import AnomalyOverview from './components/AnomalyOverview.vue'
import RiskOverview from './components/RiskOverview.vue'
import ProcessOverview from './components/ProcessOverview.vue'
import ValueOverview from './components/ValueOverview.vue'
import GovernanceTokenCapsule from '../../components/GovernanceTokenCapsule.vue'
const riskRevision = ref(0)
const anomalyRevision = ref(0)
const route = useRoute()
const tabs = navigation.find((item) => item.path === '/data-governance')!.tabs
const icons = ['Coin', 'TrendCharts', 'Shield', 'WarningFilled', 'PieChart']
/** 令牌更新后重新取数：依赖模型服务的概览卡片与页签需要重挂载。
 *  数据处理页走业务后端（不依赖令牌），因此不重挂载它，避免丢失表单里已填的内容。 */
const tabRevision = ref(0)
function reloadAfterTokenChange() {
  anomalyRevision.value++
  riskRevision.value++
  if (['governance-value', 'governance-anomaly', 'governance-risk'].includes(String(route.name)))
    tabRevision.value++
}
</script>
<template>
  <div class="governance-workspace">
    <AnomalyOverview v-if="route.name === 'governance-anomaly'" :key="anomalyRevision" />
    <RiskOverview v-else-if="route.name === 'governance-risk'" :key="riskRevision" />
    <ProcessOverview v-else-if="route.name === 'governance-process'" />
    <ValueOverview v-else-if="route.name === 'governance-value'" />
    <KpiStrip v-else :kind="PROCESS_KIND" comparison-label="暂无可比数据" />
    <nav class="governance-tabs" aria-label="数据治理子页面">
      <template v-for="(tab, index) in tabs" :key="tab.path">
        <router-link
          v-if="['process', 'value-analysis', 'anomaly', 'risk-classification'].includes(tab.path)"
          :to="tab.path === 'process' ? '/data-governance' : `/data-governance/${tab.path}`"
          :class="{
            selected:
              tab.path === 'risk-classification'
                ? route.name === 'governance-risk'
                : tab.path === 'anomaly'
                  ? route.name === 'governance-anomaly'
                  : tab.path === 'value-analysis'
                    ? route.name === 'governance-value'
                    : route.name === 'governance-process',
          }"
          :aria-current="
            (
              tab.path === 'risk-classification'
                ? route.name === 'governance-risk'
                : tab.path === 'anomaly'
                  ? route.name === 'governance-anomaly'
                  : tab.path === 'value-analysis'
                    ? route.name === 'governance-value'
                    : route.name === 'governance-process'
            )
              ? 'page'
              : undefined
          "
        >
          <AppIcon :name="icons[index]" />{{ tab.title }}
        </router-link>
        <button v-else type="button" disabled>
          <AppIcon :name="icons[index]" />{{ tab.title }}
        </button>
      </template>
      <!-- 令牌状态胶囊贴在页签行右侧：常态只有状态，点击才弹出输入框 -->
      <GovernanceTokenCapsule class="governance-tabs-extra" @saved="reloadAfterTokenChange" />
    </nav>
    <router-view
      :key="tabRevision"
      @anomaly-updated="anomalyRevision++"
      @risk-updated="riskRevision++"
    />
  </div>
</template>
