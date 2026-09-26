<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useModelWorkbench } from '../../stores/model-workbench'
import AppIcon from '../../components/AppIcon.vue'
import { isMock } from '../../api/request'
import './workbench.css'
const route = useRoute()
const store = useModelWorkbench()
const tabs = [
  { path: 'training', title: '模型训练', icon: 'Setting' },
  { path: 'management', title: '模型管理', icon: 'Coin' },
  { path: 'evaluation', title: '模型评估', icon: 'Histogram' },
  { path: 'deploy', title: '模型部署', icon: 'Box' },
  { path: 'invoke', title: '模型调用', icon: 'Link' },
]
onMounted(() => {
  if (!store.loaded) void store.load()
})
</script>
<template>
  <div v-loading="store.loading" class="mw-root">
    <nav class="mw-tabs" aria-label="模型训推子页面">
      <router-link
        v-for="tab in tabs"
        :key="tab.path"
        :to="`/model-train/${tab.path}`"
        :class="{ selected: route.name === `model-${tab.path}` }"
        :aria-current="route.name === `model-${tab.path}` ? 'page' : undefined"
        ><AppIcon :name="tab.icon" />{{ tab.title }}</router-link
      >
    </nav>
    <el-alert v-if="store.error" :title="store.error" type="error" :closable="false"
      ><el-button @click="store.load">重新加载</el-button></el-alert
    >
    <router-view v-else-if="store.loaded" />
    <p class="mw-footnote">
      {{
        isMock
          ? '演示数据与操作仅用于原型验证，不代表真实训练、部署或模型运行结果。'
          : '运行结果由后端服务提供，任务与版本以服务端记录为准。'
      }}
    </p>
  </div>
</template>
