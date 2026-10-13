<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useModelWorkbench } from '../../stores/model-workbench'
import { useComplianceEventsStore } from '../../stores/compliance-events'
import AppIcon from '../../components/AppIcon.vue'
import { isMock } from '../../api/request'
import './workbench.css'
const route = useRoute()
const router = useRouter()
const store = useModelWorkbench()
const complianceStore = useComplianceEventsStore()
const tabs = [
  { path: 'training', title: '模型训练', icon: 'Setting' },
  { path: 'management', title: '模型管理', icon: 'Coin' },
  { path: 'evaluation', title: '模型评估', icon: 'Histogram' },
  { path: 'deploy', title: '模型部署', icon: 'Box' },
  { path: 'invoke', title: '模型调用', icon: 'Link' },
]
const hasRunningTraining = computed(
  () => !isMock && store.data.training.some((task) => task.status === 'running'),
)
let pollTimer: ReturnType<typeof setTimeout> | undefined
let polling = false
let disposed = false

function stopPolling() {
  clearTimeout(pollTimer)
  pollTimer = undefined
}

function schedulePolling() {
  stopPolling()
  if (disposed || !hasRunningTraining.value) return
  pollTimer = setTimeout(async () => {
    if (disposed || polling) return
    polling = true
    try {
      await store.load()
    } finally {
      polling = false
      schedulePolling()
    }
  }, 5000)
}

watch(hasRunningTraining, schedulePolling, { immediate: true })

/** 合规监控入口：必要时先回到训练页，再滚动定位到监控面板。 */
function showComplianceMonitor() {
  if (route.name !== 'model-training') {
    void router.push('/model-train/training')
    setTimeout(() => complianceStore.requestFocus(), 200)
  } else {
    complianceStore.requestFocus()
  }
}

/** 事件记录入口：必要时先回到训练页，再打开全部记录弹窗。 */
function showComplianceRecords() {
  if (route.name !== 'model-training') {
    void router.push('/model-train/training')
    setTimeout(() => complianceStore.openRecordDialog(), 200)
  } else {
    complianceStore.openRecordDialog()
  }
}

onMounted(() => {
  disposed = false
  if (!store.loaded) void store.load()
})
onUnmounted(() => {
  disposed = true
  stopPolling()
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
      <div v-if="route.name === 'model-training'" class="mw-tab-actions">
        <el-button class="mw-tab-btn" @click="showComplianceMonitor">
          <AppIcon name="Shield" />合规监控
        </el-button>
        <el-badge
          :value="complianceStore.overview?.summary.total ?? 0"
          :hidden="!complianceStore.overview"
          type="danger"
        >
          <el-button class="mw-tab-btn" @click="showComplianceRecords">
            <AppIcon name="Document" />事件记录
          </el-button>
        </el-badge>
      </div>
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
<style scoped>
.mw-tab-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
  padding-right: 6px;
}
.mw-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}
.mw-tab-btn .el-icon {
  font-size: 17px;
}
</style>
