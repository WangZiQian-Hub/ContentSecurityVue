<script setup lang="ts">
import { computed, watch } from 'vue'
import { evaluationApi as api } from '../../../api/evaluation'
import { useEvaluationStore } from '../../../stores/evaluation'
import { useEvaluationPolling } from '../../../composables/useEvaluationPolling'
import type { ExportJob } from '../../../types/evaluation'
import EvaluationStatus from './EvaluationStatus.vue'
const props = defineProps<{ runId: string; allowed: boolean; jobs?: ExportJob[] }>()
const emit = defineEmits<{ updated: [] }>()
const store = useEvaluationStore()
const canExport = computed(() => props.allowed && store.session?.allowedActions.includes('export'))
async function refresh() {
  if (!store.exportJob) return true
  return store.fetchData(
    'export',
    (signal) => api.exportStatus(store.exportJob!.exportId, signal),
    (job) => {
      store.exportJob = job
    },
  )
}
const polling = useEvaluationPolling(refresh, () =>
  ['succeeded', 'failed'].includes(store.exportJob?.state || ''),
)
async function generate(kind: ExportJob['kind']) {
  const job = await store.write(
    `export:${props.runId}:${kind}`,
    { runId: props.runId, kind },
    (key) => api.export(props.runId, kind, key),
  )
  if (job) {
    store.exportJob = job
    polling.start()
  }
}
watch(
  () => store.exportJob?.state,
  (state) => {
    if (state === 'succeeded' || state === 'failed') emit('updated')
  },
)
</script>
<template>
  <div class="ev-actions">
    <el-button
      :disabled="!canExport || ['queued', 'running'].includes(store.exportJob?.state || '')"
      :loading="store.writing"
      @click="generate('report')"
      >生成报告</el-button
    ><el-button
      :disabled="!canExport || ['queued', 'running'].includes(store.exportJob?.state || '')"
      :loading="store.writing"
      @click="generate('evidence_bundle')"
      >生成证据包</el-button
    >
    <template v-if="store.exportJob"
      ><EvaluationStatus :value="store.exportJob.state" /><el-button
        v-if="store.exportJob.state === 'succeeded' && store.exportJob.artifactId"
        type="primary"
        :disabled="!canExport"
        @click="store.download(store.exportJob.artifactId)"
        >下载{{ store.exportJob.kind === 'report' ? '报告' : '证据包' }}</el-button
      ><span v-if="store.exportJob.error" role="alert">{{ store.exportJob.error }}</span
      ><el-button
        v-if="['queued', 'running'].includes(store.exportJob.state)"
        link
        @click="polling.start"
        >刷新生成状态</el-button
      ></template
    >
    <template v-for="job in jobs || []" :key="job.exportId"
      ><el-button
        v-if="
          job.state === 'succeeded' && job.artifactId && job.exportId !== store.exportJob?.exportId
        "
        link
        type="primary"
        :disabled="!canExport"
        @click="store.download(job.artifactId)"
        >下载已生成{{ job.kind === 'report' ? '报告' : '证据包' }}</el-button
      ></template
    >
  </div>
</template>
