<script setup lang="ts">
import { computed, onUnmounted, provide, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useComplianceStore } from '../../stores/compliance'
import AppIcon from '../../components/AppIcon.vue'
import OverviewPage from './OverviewPage.vue'
import LineagePage from './LineagePage.vue'
import NeuronAuditPage from './NeuronAuditPage.vue'
import RiskAlertPage from './RiskAlertPage.vue'
import FullChainPage from './FullChainPage.vue'
import SourceEvidenceDrawer from './components/SourceEvidenceDrawer.vue'
import NeuronIcon from './components/NeuronIcon.vue'
import { tabs } from './presentation'
const route = useRoute(),
  store = useComplianceStore(),
  drawer = ref(false),
  evidenceId = ref('')
const components = {
  '': OverviewPage,
  lineage: LineagePage,
  'full-chain': FullChainPage,
  'model-internal': NeuronAuditPage,
  'risk-alert': RiskAlertPage,
}
const tab = computed(() => String(route.params.tab || '') as keyof typeof components)
provide('complianceEvidence', (id: string) => {
  evidenceId.value = id
  drawer.value = true
  store.openEvidence(id)
})
watch(
  tab,
  () => {
    store.invalidate()
    drawer.value = false
  },
  { flush: 'sync' },
)
onUnmounted(() => store.invalidate())
</script>
<template>
  <section class="compliance-workspace">
    <div class="compliance-mode">
      <span :class="{ 'compliance-warning': store.demo }">{{
        store.demo
          ? '示例数据 · 独立设计演示，未连接后端'
          : '真实 HTTP 模式 · 数据与处置结果以服务端返回为准'
      }}</span
      ><el-switch
        :model-value="store.demo"
        active-text="示例演示"
        inactive-text="真实接口"
        aria-label="切换示例演示"
        @change="store.setDemo(Boolean($event))"
      />
    </div>
    <nav class="compliance-tabs" aria-label="合规页面导航">
      <router-link
        v-for="item in tabs"
        :key="item.path"
        :to="item.path ? `/compliance/${item.path}` : '/compliance'"
        :class="{ active: tab === item.path }"
        :aria-current="tab === item.path ? 'page' : undefined"
        ><NeuronIcon v-if="item.path === 'model-internal'" /><AppIcon v-else :name="item.icon" />{{
          item.title
        }}</router-link
      >
    </nav>
    <el-alert
      v-if="store.error"
      :title="store.error"
      type="error"
      :closable="false"
      show-icon
    /><el-alert
      v-if="store.actionError"
      :title="store.actionError"
      type="error"
      :closable="false"
    />
    <div v-loading="store.loading" :aria-busy="store.loading" class="compliance-content">
      <component :is="components[tab] || OverviewPage" :key="`${tab}-${store.demo}`" />
    </div>
    <SourceEvidenceDrawer v-model="drawer" :evidence-id="evidenceId" />
  </section>
</template>
<style scoped src="./compliance.css"></style>
