// “数据资源”
<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import KpiStrip from '../../components/KpiStrip.vue'
import AppIcon from '../../components/AppIcon.vue'
import { useDataResourceStore } from '../../stores/data-resource'
import type { ResourceView } from '../../types/data-resource'
const route = useRoute()
const store = useDataResourceStore()
const view = computed(() => String(route.name).replace('resource-', '') as ResourceView)
// 与其他模块统一：卡片通过 kind 调用 GET /api/v1/kpis。生成 KpiKind
const kpiKind = computed(() => `resource-${view.value}`)
const links = [
  { path: '/data-resource', title: '资源总览', icon: 'House' },
  { path: '/data-resource/ingest', title: '数据接入', icon: 'UploadFilled' },
  { path: '/data-resource/datasets', title: '数据集管理', icon: 'FolderOpened' },
  { path: '/data-resource/statistics', title: '数据资源统计', icon: 'Histogram' },
]
watch(
  view,
  (value) => {
    void store.loadSummary(value)
  },
  { immediate: true },
)
</script>
<template>
  <div class="resource-workspace">
    <KpiStrip :kind="kpiKind" />
    <nav class="resource-tabs" aria-label="数据资源页面导航">
      <router-link
        v-for="link in links"
        :key="link.path"
        :to="link.path"
        :class="{ selected: route.path === link.path }"
        :aria-current="route.path === link.path ? 'page' : undefined"
      >
        <AppIcon :name="link.icon" />{{ link.title }}
      </router-link>
    </nav>
    <el-alert v-if="store.error" :title="store.error" type="error" :closable="false" show-icon>
      <el-button link type="primary" @click="store.loadSummary(view)">重新加载</el-button>
    </el-alert>
    <div v-loading="store.loading" class="resource-page-body"><router-view /></div>
  </div>
</template>
