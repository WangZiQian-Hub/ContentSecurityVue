<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { agentApi } from '../../api/internal-agent'
import { agentActive } from '../../types/internal-agent'
import type { AgentInput, AgentOptions, AgentRun } from '../../types/internal-agent'
import AgentTaskForm from './components/agent-tasks/AgentTaskForm.vue'
import AgentTaskList from './components/agent-tasks/AgentTaskList.vue'
import AgentTaskDetailDrawer from './components/agent-tasks/AgentTaskDetailDrawer.vue'
const options = ref<AgentOptions>(),
  runs = ref<AgentRun[]>([]),
  detail = ref<AgentRun>(),
  opened = ref(false)
const loading = ref(false),
  creating = ref(false),
  actionBusy = ref(false),
  error = ref(''),
  optionError = ref(''),
  detailError = ref('')
let alive = true,
  listVersion = 0,
  detailVersion = 0,
  timer: ReturnType<typeof setTimeout> | undefined
const controller = new AbortController()
const batchRevision = ref(0)
let batchSignature = ''
let retryInput = '',
  retryKey = ''
const message = (e: unknown) => {
  const body = (e as { response?: { data?: { message?: string } } })?.response?.data
  return body?.message || (e instanceof Error ? e.message : '请求失败，请重试')
}
async function refresh() {
  const version = ++listVersion
  try {
    const result = await agentApi.list(controller.signal)
    if (alive && version === listVersion) {
      const signature = result.items.map((r) => `${r.runId}:${r.trace?.snapshotId || ''}`).join('|')
      if (signature !== batchSignature) {
        batchSignature = signature
        batchRevision.value++
      }
      runs.value = result.items
      error.value = ''
    }
  } catch (e) {
    if (alive && version === listVersion) error.value = message(e)
  }
}
async function initialize() {
  loading.value = true
  optionError.value = ''
  try {
    const data = await agentApi.options(controller.signal)
    if (alive) options.value = data
  } catch (e) {
    if (alive) optionError.value = message(e)
  } finally {
    if (alive) loading.value = false
  }
  await refresh()
}
async function select(id: string) {
  const version = ++detailVersion
  opened.value = true
  detail.value = undefined
  detailError.value = ''
  try {
    const data = await agentApi.detail(id, controller.signal)
    if (alive && version === detailVersion) detail.value = data
  } catch (e) {
    if (alive && version === detailVersion) detailError.value = message(e)
  }
}
async function create(input: AgentInput) {
  if (creating.value) return
  creating.value = true
  error.value = ''
  const serialized = JSON.stringify(input)
  if (serialized !== retryInput) {
    retryInput = serialized
    retryKey = crypto.randomUUID()
  }
  try {
    const run = await agentApi.create(input, retryKey)
    retryInput = ''
    retryKey = ''
    if (alive) {
      await refresh()
      await select(run.runId)
    }
  } catch (e) {
    if (alive) error.value = message(e)
  } finally {
    if (alive) creating.value = false
  }
}
async function action(kind: 'stop' | 'trace') {
  if (!detail.value || actionBusy.value) return
  actionBusy.value = true
  const id = detail.value.runId,
    version = detailVersion
  try {
    const result = await agentApi[kind](id)
    if (alive && version === detailVersion) detail.value = result
    await refresh()
  } catch (e) {
    if (alive && version === detailVersion) detailError.value = message(e)
  } finally {
    if (alive) actionBusy.value = false
  }
}
async function poll() {
  if (!alive) return
  if (runs.value.some(agentActive) || (detail.value && agentActive(detail.value))) {
    await refresh()
    const current = detail.value,
      version = detailVersion
    if (opened.value && current && agentActive(current)) {
      try {
        const data = await agentApi.detail(current.runId, controller.signal)
        if (alive && version === detailVersion) detail.value = data
      } catch (e) {
        if (alive && version === detailVersion) detailError.value = message(e)
      }
    }
  }
  if (alive) timer = setTimeout(poll, 2000)
}
onMounted(async () => {
  await initialize()
  if (alive) void poll()
})
onUnmounted(() => {
  alive = false
  controller.abort()
  clearTimeout(timer)
  detailVersion++
  listVersion++
})
</script>
<template>
  <section v-loading="loading" class="agent-tasks-page">
    <div class="agent-intro">
      <strong>平台内部智能体任务</strong
      ><span
        >DeepSeek 选择工具，后端校验权限并保存真实轨迹。支持小样本隐私核查和越权拦截演示。</span
      >
    </div>
    <el-alert
      v-if="optionError || error"
      :title="optionError || error"
      type="error"
      :closable="false"
      show-icon
    />
    <el-alert
      v-if="options?.modelError"
      :title="options.modelError"
      type="warning"
      :closable="false"
    />
    <div class="agent-page-actions">
      <el-button :disabled="loading" @click="initialize">刷新模型与任务</el-button>
    </div>
    <div class="agent-workspace">
      <AgentTaskForm
        :options="options"
        :busy="creating"
        :running="runs.some(agentActive)"
        :batch-refresh-key="batchRevision"
        @submit="create"
      />
      <AgentTaskList :runs="runs" @select="select" />
    </div>
    <AgentTaskDetailDrawer
      v-model="opened"
      :run="detail"
      :error="detailError"
      :busy="actionBusy"
      :can-operate="!!options?.canCreate"
      @stop="action('stop')"
      @trace="action('trace')"
    />
  </section>
</template>
<style scoped>
.agent-intro {
  display: flex;
  gap: 18px;
  padding: 14px 16px;
  background: #edf5ff;
  border-left: 3px solid #2778fa;
  color: #456388;
  line-height: 1.7;
}
.agent-intro strong {
  white-space: nowrap;
  color: #193b68;
}
.agent-page-actions {
  display: flex;
  justify-content: flex-end;
  margin: 12px 0;
}
.agent-workspace {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 18px;
}
.agent-tasks-page :deep(.el-alert) {
  margin-top: 12px;
}
@media (max-width: 1050px) {
  .agent-workspace {
    grid-template-columns: 1fr;
  }
  .agent-intro {
    flex-direction: column;
    gap: 4px;
  }
}
</style>
