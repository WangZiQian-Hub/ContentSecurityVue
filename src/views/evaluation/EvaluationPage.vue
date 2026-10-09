<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useEvaluationStore } from '../../stores/evaluation'
import { isEvaluationDemo } from '../../api/evaluation'
import MetricManagementPage from './MetricManagementPage.vue'
import MetricDetail from './MetricDetail.vue'
import EvaluationTaskPage from './EvaluationTaskPage.vue'
import EvaluationTaskCreate from './EvaluationTaskCreate.vue'
import EvaluationExecutionPage from './EvaluationExecutionPage.vue'
import EvaluationResultPage from './EvaluationResultPage.vue'
import EvaluationRecordPage from './EvaluationRecordPage.vue'
import EvaluationEvidenceDetail from './EvaluationEvidenceDetail.vue'
import AppIcon from '../../components/AppIcon.vue'
import './evaluation.css'
const route = useRoute()
const store = useEvaluationStore()
const accessToken = ref('')
async function authorize() {
  if (await store.authorize(accessToken.value)) accessToken.value = ''
}
const pages = {
  metrics: MetricManagementPage,
  tasks: EvaluationTaskPage,
  execution: EvaluationExecutionPage,
  results: EvaluationResultPage,
  records: EvaluationRecordPage,
}
const component = computed(() => {
  if (route.query.evidenceId) return EvaluationEvidenceDetail
  if (route.query.metricId || route.query.metricCode) return MetricDetail
  if (route.params.tab === 'tasks' && route.query.view === 'new') return EvaluationTaskCreate
  return pages[(route.params.tab || 'metrics') as keyof typeof pages]
})
watch(
  () => route.fullPath,
  () => {
    store.clear()
    void store.loadSession()
  },
  { immediate: true, flush: 'sync' },
)
onBeforeUnmount(store.clear)
</script>
<template>
  <div class="evaluation-workspace" :aria-busy="store.loading">
    <nav class="evaluation-tabs" aria-label="测试评估子页面">
      <router-link
        v-for="tab in [
          { path: '/evaluation', title: '指标管理', icon: 'DataAnalysis' },
          { path: '/evaluation/tasks', title: '测试任务', icon: 'Tickets' },
          { path: '/evaluation/execution', title: '测试执行', icon: 'VideoPlay' },
          { path: '/evaluation/results', title: '测试结果', icon: 'Histogram' },
          { path: '/evaluation/records', title: '测试记录', icon: 'Document' },
        ]"
        :key="tab.path"
        :to="tab.path"
        :class="{ selected: tab.path === '/evaluation' ? route.path === '/evaluation' : route.path.startsWith(tab.path) }"
      ><AppIcon :name="tab.icon" />{{ tab.title }}</router-link>
    </nav>
    <div v-if="isEvaluationDemo" class="ev-note" role="status">
      <b>示例演示模式</b> · 数据与操作仅用于演示，刷新后重置；不写入后端，不生成正式报告。
    </div>
    <div v-if="store.error" class="ev-error" role="alert">
      <strong>{{ store.error }}</strong>
      <ul v-if="store.issues.length">
        <li v-for="(issue, index) in store.issues" :key="index">{{ issue.message }}</li>
      </ul>
      <el-button size="small" @click="store.loadSession()">重新检查授权</el-button>
    </div>
    <section v-if="!isEvaluationDemo && !store.session" class="ev-panel">
      <h2>测试评估身份验证</h2>
      <p>使用已获授权的访问凭证进入测试评估工作区。</p>
      <form class="ev-toolbar" @submit.prevent="authorize">
        <el-input
          v-model="accessToken"
          type="password"
          show-password
          autocomplete="off"
          placeholder="访问凭证"
          aria-label="访问凭证"
        />
        <el-button
          native-type="submit"
          type="primary"
          :disabled="!accessToken.trim()"
          :loading="store.loading"
          >验证并进入</el-button
        >
      </form>
    </section>
    <template v-else-if="component">
      <div v-if="!isEvaluationDemo && store.session" class="ev-actions">
        <el-tag type="success" effect="plain">评估工作区 · 实时数据</el-tag
        ><span class="ev-muted">{{ store.session.role === 'reader' ? '只读权限' : '已授权' }}</span>
      </div>
      <component :is="component" :key="route.fullPath" />
    </template>
    <el-empty v-else description="此测试评估页面不存在"
      ><router-link to="/evaluation">返回指标管理</router-link></el-empty
    >
  </div>
</template>
