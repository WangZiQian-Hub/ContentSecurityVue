<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useComplianceStore } from '../../../stores/compliance'
import { demoRefs } from '../../../mock/compliance'
import type { Capability, ContextQuery } from '../../../types/compliance'
const props = defineProps<{ kind: string; label: string; capability?: Capability }>()
const store = useComplianceStore(),
  route = useRoute()
const sourceId = ref(''),
  sourceKind = ref(props.kind),
  version = ref(''),
  capture = ref(''),
  targetTrace = ref('')
const versions = computed(
  () => store.context?.candidates.filter((c) => String(c.sourceId) === sourceId.value) || [],
)
const versionOptions = computed(() => [
  ...new Set(versions.value.map((c) => c.modelVersion).filter((v): v is string => !!v)),
])
const captureOptions = computed(() =>
  versions.value.filter((c) => c.modelVersion === version.value && c.captureId),
)
const subjectOptions = computed(() => [
  ...new Map(store.candidates.map((c) => [String(c.sourceId), c])).values(),
])
function load() {
  if (!sourceId.value.trim()) {
    store.invalidate()
    store.loadCandidates(props.kind)
    return
  }
  store.loadContext(
    {
      sourceKind: sourceKind.value,
      sourceId: sourceId.value.trim(),
      traceId: targetTrace.value || undefined,
    },
    props.capability,
    { versionId: version.value || undefined, captureId: capture.value || undefined },
  )
}
function select(value: string) {
  store.invalidate()
  version.value = ''
  capture.value = ''
  targetTrace.value = ''
  const matches = store.candidates.filter((c) => String(c.sourceId) === value)
  const item = matches.length === 1 ? matches[0] : undefined
  if (item) {
    version.value = item.modelVersion || ''
    capture.value = item.captureId || ''
    sourceKind.value = item.sourceKind
  }
  load()
}
function inbound() {
  const query = route.query
  sourceKind.value = props.kind
  if (
    typeof query.sourceKind === 'string' &&
    ['model', 'model_call', 'training_task', 'dataset', 'task', 'trace'].includes(query.sourceKind)
  )
    sourceKind.value = query.sourceKind
  sourceId.value = String(
    query.trainingTaskId || query.taskId || query.modelId || query.sourceId || query.traceId || '',
  )
  targetTrace.value = query.taskId ? String(query.traceId || '') : ''
  version.value = String(query.versionId || '')
  capture.value = String(query.captureId || '')
  if (store.demo && Object.keys(query).length === 0) {
    sourceId.value =
      props.kind === 'model'
        ? demoRefs.model
        : props.kind === 'training_task'
          ? demoRefs.training
          : demoRefs.call
    if (props.kind === 'model') {
      version.value = 'v1.4.0'
      capture.value = demoRefs.capture
    }
  }
  if (query.traceId && !query.taskId && !query.sourceId) sourceKind.value = 'trace'
  load()
}
onMounted(() => {
  inbound()
  if (sourceId.value) store.loadCandidates(props.kind)
})
watch(() => route.query, inbound)
defineExpose({ load })
const resolutionLabels = {
  not_found: '未找到该对象，未选择替代记录。',
  conflict: '调用记录与 Trace 指向不同对象，请核对来源。',
  ambiguous: '请选择精确版本或捕获记录，未自动选择第一条。',
  resolved: '对象解析成功',
}
function setVersion(value: string) {
  const matches = versions.value.filter((c) => c.modelVersion === value)
  const candidate = matches.length === 1 ? matches[0] : undefined
  capture.value = candidate?.captureId || ''
  load()
}
function kindChanged() {
  store.invalidate()
  sourceId.value = ''
}
const queryPreview = computed<ContextQuery>(() => ({
  sourceKind: sourceKind.value,
  sourceId: sourceId.value,
}))
</script>
<template>
  <div class="compliance-filter">
    <label v-if="!capability"
      >标识类型<el-select v-model="sourceKind" aria-label="标识类型" @change="kindChanged">
        <el-option label="调用记录 ID" value="model_call" /><el-option
          label="Trace ID"
          value="trace"
        /><el-option label="统一任务 ID" value="task" /> </el-select
    ></label>
    <label
      >{{ label
      }}<el-select
        v-model="sourceId"
        filterable
        allow-create
        default-first-option
        placeholder="选择登记对象或输入完整 ID"
        :aria-label="label"
        @change="select"
        ><el-option
          v-for="item in subjectOptions"
          :key="`${item.sourceKind}-${item.sourceId}-${item.modelVersion}`"
          :label="
            store.candidates.filter((c) => c.sourceId === item.sourceId).length > 1
              ? item.subjectRef.label
              : item.label
          "
          :value="String(item.sourceId)" /></el-select
    ></label>
    <label v-if="kind === 'model'"
      >精确模型版本<el-select
        v-model="version"
        aria-label="精确模型版本"
        placeholder="请选择版本"
        @change="setVersion"
        ><el-option
          v-for="item in versionOptions"
          :key="item"
          :label="item"
          :value="item" /></el-select
    ></label>
    <label v-if="kind === 'model'"
      >捕获记录<el-select
        v-model="capture"
        filterable
        allow-create
        aria-label="捕获记录"
        placeholder="未采集 / 输入捕获 ID"
        @change="load"
        ><el-option
          v-for="item in captureOptions"
          :key="item.captureId!"
          :label="item.captureId!"
          :value="item.captureId!" /></el-select
    ></label>
    <span class="compliance-muted">{{
      sourceId ? `${queryPreview.sourceKind} · 完整引用查询` : '先选择对象，或从来源模块进入'
    }}</span
    ><el-button type="primary" :loading="store.loading" @click="load">查询记录</el-button>
    <el-button
      v-if="capability && capability !== 'neuron_audit'"
      :disabled="
        !store.context?.subjectRef ||
        store.context.resolution !== 'resolved' ||
        store.demo ||
        store.busy
      "
      :loading="store.busy"
      @click="store.execute(capability)"
      >重新审计</el-button
    >
    <el-button
      v-if="!capability"
      :disabled="!store.context?.taskId || store.demo || store.busy"
      @click="store.execute('full_chain_audit')"
      >重新审计</el-button
    >
  </div>
  <el-alert
    v-if="store.context && store.context.resolution !== 'resolved'"
    :title="resolutionLabels[store.context.resolution]"
    type="warning"
    :closable="false"
  />
  <el-select
    v-if="store.audits && store.audits.total > 1"
    placeholder="选择一份审计记录"
    aria-label="审计记录"
    :model-value="store.audit?.id"
    @change="store.selectAudit"
    ><el-option
      v-for="item in store.audits.items"
      :key="item.id"
      :label="`${item.displayId} · ${item.reviewReason}`"
      :value="item.id"
  /></el-select>
  <p v-if="store.task" class="compliance-note">
    执行任务 {{ store.task.taskId }}：{{
      store.task.status
    }}。执行成功不代表合规通过；完成后请查询已落库审计结果。
  </p>
</template>
