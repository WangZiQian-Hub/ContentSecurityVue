<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { evaluationApi as api, isEvaluationDemo } from '../../api/evaluation'
import { demoExecutionTaskId } from '../../mock/evaluation'
import { useEvaluationStore } from '../../stores/evaluation'
import { useEvaluationPolling } from '../../composables/useEvaluationPolling'
import { label, time } from './presentation'
import EvaluationPanel from './components/EvaluationPanel.vue'
import EvaluationStatus from './components/EvaluationStatus.vue'
const store = useEvaluationStore()
const route = useRoute()
const router = useRouter()
const taskId = String(route.query.taskId || (isEvaluationDemo ? demoExecutionTaskId : ''))
const retryReason = ref('')
let cursor = 0
const percentage = computed(() =>
  store.task?.totalCount
    ? Math.floor((store.task.processedCount / store.task.totalCount) * 100)
    : null,
)
async function load() {
  if (!taskId) return true
  const ok = await store.fetchData(
    'progress',
    (signal) => api.progress(taskId, signal),
    (data) => {
      store.task = data
    },
  )
  if (ok) {
    await store.fetchData(
      'events',
      (signal) => api.events(taskId, cursor, signal),
      (data) => {
        store.events.push(...data.items)
        cursor = data.nextCursor
      },
    )
    if (!store.run && store.task)
      await store.fetchData(
        'execution-run',
        (signal) => api.run(store.task!.runId, signal),
        (data) => {
          store.run = data
        },
      )
  }
  return ok
}
const polling = useEvaluationPolling(
  load,
  () => !!store.task && !['pending', 'running'].includes(store.task.status),
)
async function action(kind: 'start' | 'cancel') {
  const task = await store.write(kind + ':' + taskId, taskId, (key) => api[kind](taskId, key))
  if (task) {
    store.task = task
    polling.start()
  }
}
async function retry() {
  if (!store.task || !retryReason.value.trim()) return
  const runId = store.task.runId
  const task = await store.write('retry:' + runId, retryReason.value, (key) =>
    api.retry(runId, retryReason.value, key),
  )
  if (task) await router.push({ path: '/evaluation/execution', query: { taskId: task.taskId } })
}
onMounted(() => {
  if (taskId) polling.start()
})
</script>
<template>
  <EvaluationPanel title="测试执行" :subtitle="isEvaluationDemo ? '示例执行进度与事件 · 可从任务列表选择其他任务' : '跟踪真实阶段、运行事件与冻结上下文'">
    <template #actions
      ><el-button @click="router.push('/evaluation/tasks')">选择任务</el-button
      ><el-button v-if="taskId" @click="polling.start">刷新</el-button></template
    >
    <el-empty v-if="!taskId" description="请从测试任务中选择一个任务查看执行情况" />
    <el-skeleton v-else-if="store.loading && !store.task" :rows="5" animated />
    <div v-if="store.task" class="ev-banner">
      <b>{{ store.task.name }}</b
      ><EvaluationStatus :value="store.task.status" />
      <div class="ev-actions">
        <el-button
          v-if="store.task.allowedActions.includes('start')"
          type="primary"
          :loading="store.writing"
          @click="action('start')"
          >启动任务</el-button
        ><el-button
          v-if="store.task.allowedActions.includes('cancel')"
          :loading="store.writing"
          @click="action('cancel')"
          >取消任务</el-button
        ><el-button
          v-if="!['pending', 'running'].includes(store.task.status)"
          type="primary"
          @click="router.push({ path: '/evaluation/results', query: { runId: store.task.runId } })"
          >查看结果</el-button
        >
      </div>
    </div>
  </EvaluationPanel>
  <template v-if="store.task"
    ><div class="ev-three">
      <EvaluationPanel title="当前执行进度"
        ><el-progress
          v-if="percentage !== null"
          type="circle"
          :percentage="percentage"
          :width="136"
        />
        <p v-else>总量尚未确定</p>
        <h3 style="margin-top: 20px">{{ label(store.task.stage) }}</h3>
        <p>
          已处理 {{ store.task.processedCount }} / {{ store.task.totalCount ?? '未知' }} 个单元
        </p></EvaluationPanel
      >
      <EvaluationPanel title="运行上下文"
        ><div class="ev-field">
          <span>数据版本</span><b>{{ store.task.datasetVersion }}</b>
        </div>
        <div class="ev-field">
          <span>标准标签</span><span>{{ store.run?.snapshot.labelVersion || '—' }}</span>
        </div>
        <div class="ev-field">
          <span>模型版本</span><span>{{ store.task.modelVersion || '不适用' }}</span>
        </div>
        <div class="ev-field">
          <span>目标阶段</span><span>{{ label(store.task.targetStage) }}</span>
        </div>
        <div class="ev-field">
          <span>指标</span
          ><span>{{ store.run?.snapshot.metricRevisions.map((m) => m.name).join('、') }}</span>
        </div></EvaluationPanel
      >
      <EvaluationPanel title="本次执行"
        ><div class="ev-field">
          <span>开始时间</span><span>{{ time(store.task.startedAt) }}</span>
        </div>
        <div class="ev-field">
          <span>完成时间</span><span>{{ time(store.task.finishedAt) }}</span>
        </div>
        <div class="ev-field">
          <span>最后更新</span><span>{{ time(store.updatedAt) }}</span>
        </div>
        <div class="ev-field">
          <span>运行尝试</span><span>第 {{ store.run?.attemptNo || 1 }} 次</span>
        </div>
        <div v-if="store.run?.retryOf" class="ev-field">
          <span>前次运行</span
          ><router-link :to="{ path: '/evaluation/results', query: { runId: store.run.retryOf } }"
            >查看历史尝试</router-link
          >
        </div></EvaluationPanel
      >
    </div>
    <EvaluationPanel v-if="store.task.error" title="执行异常"
      ><el-alert :title="store.task.error" type="error" :closable="false" />
      <div
        v-if="store.task.allowedActions.includes('retry')"
        class="ev-toolbar"
        style="margin-top: 16px"
      >
        <el-input v-model="retryReason" placeholder="填写重试原因" maxlength="500" /><el-button
          type="primary"
          :disabled="!retryReason.trim()"
          :loading="store.writing"
          @click="retry"
          >创建新的重试</el-button
        >
      </div></EvaluationPanel
    >
    <EvaluationPanel title="运行事件"
      ><el-table :data="store.events" empty-text="暂无运行事件"
        ><el-table-column label="时间" min-width="180"
          ><template #default="{ row }">{{ time(row.createdAt) }}</template></el-table-column
        ><el-table-column label="阶段" width="100"
          ><template #default="{ row }">{{ label(row.stage) }}</template></el-table-column
        ><el-table-column prop="message" label="事件内容" min-width="300" /><el-table-column
          label="状态"
          width="100"
          ><template #default="{ row }"
            ><EvaluationStatus
              :value="row.status" /></template></el-table-column></el-table></EvaluationPanel
  ></template>
</template>
