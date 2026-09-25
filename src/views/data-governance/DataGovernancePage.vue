// “数据治理” 页面
<script setup lang="ts">
import KpiStrip from '../../components/KpiStrip.vue'
import AppIcon from '../../components/AppIcon.vue'
import { navigation } from '../../router/navigation'
import { PROCESS_KIND } from '../../types/data-governance'
import { useRoute } from 'vue-router'
import { VALUE_KIND } from '../../types/data-value'
const route = useRoute()
const tabs = navigation.find((item) => item.path === '/data-governance')!.tabs
const icons = ['Coin', 'TrendCharts', 'Shield', 'WarningFilled', 'PieChart']
</script>
<template>
  <div class="governance-workspace">
    <KpiStrip
      :kind="route.name === 'governance-value' ? VALUE_KIND : PROCESS_KIND"
      :comparison-label="route.name === 'governance-value' ? '暂无可比数据' : undefined"
    />
    <nav class="governance-tabs" aria-label="数据治理子页面">
      <template v-for="(tab, index) in tabs" :key="tab.path">
        <router-link
          v-if="['process', 'value-analysis'].includes(tab.path)"
          :to="tab.path === 'process' ? '/data-governance' : '/data-governance/value-analysis'"
          :class="{
            selected:
              tab.path === 'value-analysis'
                ? route.name === 'governance-value'
                : route.name === 'governance-process',
          }"
          :aria-current="
            (
              tab.path === 'value-analysis'
                ? route.name === 'governance-value'
                : route.name === 'governance-process'
            )
              ? 'page'
              : undefined
          "
        >
          <AppIcon :name="icons[index]" />{{ tab.title }}
        </router-link>
        <button v-else type="button" disabled :title="`${tab.title}暂未开放`">
          <AppIcon :name="icons[index]" />{{ tab.title }}
        </button>
      </template>
    </nav>
    <router-view />
  </div>
</template>
