// “数据治理” 页面
<script setup lang="ts">
import KpiStrip from '../../components/KpiStrip.vue'
import AppIcon from '../../components/AppIcon.vue'
import { navigation } from '../../router/navigation'
import { PROCESS_KIND } from '../../types/data-governance'
const tabs = navigation.find((item) => item.path === '/data-governance')!.tabs
const icons = ['Coin', 'TrendCharts', 'Shield', 'WarningFilled', 'PieChart']
</script>
<template>
  <div class="governance-workspace">
    <KpiStrip :kind="PROCESS_KIND" />
    <nav class="governance-tabs" aria-label="数据治理子页面">
      <template v-for="(tab, index) in tabs" :key="tab.path">
        <router-link
          v-if="tab.path === 'process'"
          to="/data-governance"
          class="selected"
          aria-current="page"
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
