<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { evaluationApi as api } from '../../api/evaluation'
import { useEvaluationStore } from '../../stores/evaluation'
import type { EvaluationConfig } from '../../types/evaluation'
import { label, threshold, time } from './presentation'
import EvaluationPanel from './components/EvaluationPanel.vue'
const store = useEvaluationStore()
const route = useRoute()
const router = useRouter()
const name = ref('')
const kind = ref('task_result')
const keyword = ref('')
const selectedSource = ref('')
const config = reactive<EvaluationConfig>({
  schemaVersion: '1.0',
  targetStage: 'final',
  executionMode: 'reference',
  sourceRefs: [],
  datasetVersionRef: '',
  labelVersionRef: '',
  modelVersionRef: null,
  metricRevisionRefs: [],
  sampleScope: { mode: 'all' },
  preflightToken: null,
  retestOf: String(route.query.retestOf || '') || null,
})
const source = computed(() =>
  store.contexts?.candidates.find((s) => `${s.entityId}:${s.versionId}` === selectedSource.value),
)
const selectedMetrics = computed(
  () =>
    store.metrics?.items.filter(
      (m) => m.activeRevision && config.metricRevisionRefs.includes(m.activeRevision.revisionId),
    ) || [],
)
const canWrite = computed(() => store.session?.allowedActions.includes('write'))
const requirements = computed(() => [
  ...new Set(selectedMetrics.value.flatMap((m) => m.activeRevision?.inputRequirements || [])),
])
watch([() => JSON.stringify({ ...config, preflightToken: null }), name], () => {
  config.preflightToken = null
  store.preflight = null
})
watch(selectedSource, () => {
  const value = source.value
  config.sourceRefs = value
    ? [{ entityType: value.entityType, entityId: value.entityId, versionId: value.versionId }]
    : []
  config.datasetVersionRef = value?.datasetVersion || ''
  config.labelVersionRef = value?.labelVersion || ''
  config.modelVersionRef = value?.modelVersion || null
})
async function loadSources() {
  selectedSource.value = ''
  store.contexts = null
  await store.fetchData(
    'contexts',
    (signal) => api.contexts(kind.value, keyword.value, signal),
    (data) => {
      store.contexts = data
    },
  )
}
async function load() {
  await store.fetchData(
    'metrics',
    (signal) => api.metrics({ status: 'enabled', pageSize: 100 }, signal),
    (data) => {
      store.metrics = data
    },
  )
  await loadSources()
  if (config.retestOf)
    await store.fetchData(
      'retest',
      (signal) => api.run(config.retestOf!, signal),
      (run) => {
        name.value = run.name + '（复测）'
        config.targetStage = run.config.targetStage
        config.metricRevisionRefs = run.config.metricRevisionRefs
      },
    )
}
async function check() {
  const payload = { ...config, preflightToken: null }
  const result = await store.write('preflight', payload, (key) => api.preflight(payload, key))
  if (result) {
    store.preflight = result
    config.preflightToken = result.token
  }
}
async function create() {
  const task = await store.write('create-task', { name: name.value, config }, (key) =>
    api.createTask(name.value, config, key),
  )
  if (task) await router.push({ path: '/evaluation/execution', query: { taskId: task.taskId } })
}
onMounted(load)
</script>
<template>
  <div class="ev-actions">
    <el-button @click="router.push('/evaluation/tasks')">← 返回测试任务</el-button
    ><el-button @click="load">刷新来源与指标</el-button>
  </div>
  <div class="ev-columns">
    <EvaluationPanel title="新建测试任务" subtitle="选择来源结果与版本，预检通过后冻结计划。">
      <el-form label-position="top"
        ><div class="ev-form-grid">
          <el-form-item label="任务名称" required class="ev-span"
            ><el-input v-model="name" maxlength="255" placeholder="输入本次测试名称"
          /></el-form-item>
          <el-form-item label="执行方式"
            ><el-select v-model="config.executionMode"
              ><el-option label="引用已有结果" value="reference" /><el-option
                label="重新运行能力"
                value="rerun" /></el-select
          ></el-form-item>
          <el-form-item label="目标阶段"
            ><el-select v-model="config.targetStage"
              ><el-option label="中期" value="midterm" /><el-option
                label="完成期"
                value="final" /></el-select
          ></el-form-item>
          <el-form-item label="来源类型"
            ><el-select v-model="kind" @change="loadSources"
              ><el-option label="能力任务结果" value="task_result" /><el-option
                label="模型前后对照"
                value="model_comparison" /><el-option
                label="标准链路与审计记录"
                value="audit_record" /><el-option
                label="数据资源快照"
                value="dataset_snapshot" /></el-select
          ></el-form-item>
          <el-form-item label="查找来源"
            ><el-input v-model="keyword" placeholder="来源名称或编号" @keyup.enter="loadSources"
              ><template #append
                ><el-button @click="loadSources">查询</el-button></template
              ></el-input
            ></el-form-item
          >
          <el-form-item label="来源及精确版本" required class="ev-span"
            ><el-select
              v-model="selectedSource"
              filterable
              placeholder="请选择已登记来源"
              style="width: 100%"
              ><el-option
                v-for="candidate in store.contexts?.candidates || []"
                :key="`${candidate.entityId}:${candidate.versionId}`"
                :value="`${candidate.entityId}:${candidate.versionId}`"
                :label="`${candidate.name} · ${candidate.versionId}`" /></el-select
          ></el-form-item></div
      ></el-form>
      <div v-if="store.contexts?.resolution === 'unavailable'" class="ev-note">
        <b>来源暂不可用</b>
        <p v-for="issue in store.contexts.issues" :key="issue.reasonCode">{{ issue.message }}</p>
      </div>
      <el-empty
        v-else-if="store.contexts && !store.contexts.candidates.length"
        description="暂无已登记的来源结果"
        :image-size="70"
      />
      <template v-if="source"
        ><div class="ev-field">
          <span>数据版本</span><b>{{ source.datasetVersion }}</b>
        </div>
        <div class="ev-field">
          <span>标签版本</span><b>{{ source.labelVersion }}</b>
        </div>
        <div v-if="source.modelVersion" class="ev-field">
          <span>模型版本</span><b>{{ source.modelVersion }}</b>
        </div>
        <div class="ev-field">
          <span>样本范围</span><span>全部 {{ source.sampleCount }} 个单元</span>
        </div>
        <div class="ev-field">
          <span>算法来源</span><span>{{ label(source.algorithmMode) }}</span>
        </div>
        <div v-if="config.executionMode === 'rerun' && !source.canRerun" class="ev-note">
          此来源当前不支持重新运行。
        </div></template
      >
      <h3 style="margin-top: 24px">选择验收指标</h3>
      <el-checkbox-group v-model="config.metricRevisionRefs" class="ev-metric-options"
        ><div
          v-for="metric in store.metrics?.items || []"
          :key="metric.metricId"
          class="ev-metric-option"
        >
          <el-checkbox
            :value="metric.activeRevision?.revisionId || metric.metricId"
            :disabled="
              !metric.activeRevision ||
              !metric.activeRevision.thresholds.some((t) => t.stage === config.targetStage)
            "
            >{{ metric.name }}
            <span class="ev-muted">{{
              metric.activeRevision ? 'r' + metric.activeRevision.revisionNo : '尚未发布'
            }}</span></el-checkbox
          >
          <p>
            {{
              threshold(
                metric.activeRevision?.thresholds.find((t) => t.stage === config.targetStage),
              )
            }}
          </p>
        </div></el-checkbox-group
      >
    </EvaluationPanel>
    <EvaluationPanel title="启动前检查" subtitle="创建时再次验证，成功后保留不可变快照。">
      <div class="ev-field">
        <span>目标阶段</span><b>{{ label(config.targetStage) }}</b>
      </div>
      <div class="ev-field">
        <span>所选指标</span><b>{{ selectedMetrics.length }} 项</b>
      </div>
      <div v-if="requirements.length" class="ev-field">
        <span>所需材料</span><span>{{ requirements.map(label).join('、') }}</span>
      </div>
      <div
        v-if="selectedMetrics.some((m) => m.activeRevision?.formulaCode === 'risk_reduction')"
        class="ev-note"
      >
        需同一测试集的基线与治理后结果、相同判定器及逐条配对材料，均从所选来源读取。
      </div>
      <div
        v-if="
          selectedMetrics.some((m) =>
            ['chain_restore', 'trace_complete', 'matrix'].includes(
              m.activeRevision?.formulaCode || '',
            ),
          )
        "
        class="ev-note"
      >
        需标准链路、阶段关联或覆盖矩阵证据。预检将核验所选来源中的对应材料。
      </div>
      <div v-if="store.preflight" style="margin-top: 18px">
        <el-alert
          :type="store.preflight.canCreate ? 'success' : 'warning'"
          :closable="false"
          :title="store.preflight.canCreate ? '预检通过，可创建任务' : '预检未通过，请完善以下条件'"
        />
        <ul>
          <li v-for="(issue, index) in store.preflight.issues" :key="index">{{ issue.message }}</li>
        </ul>
        <p class="ev-muted">检查有效期至 {{ time(store.preflight.expiresAt) }}</p>
      </div>
      <div class="ev-footer">
        <el-button
          :loading="store.writing"
          :disabled="!canWrite || !source || !config.metricRevisionRefs.length || !name"
          @click="check"
          >执行预检</el-button
        ><el-button
          type="primary"
          :loading="store.writing"
          :disabled="!canWrite || !store.preflight?.canCreate || !config.preflightToken"
          @click="create"
          >创建并冻结</el-button
        >
      </div>
    </EvaluationPanel>
  </div>
</template>
