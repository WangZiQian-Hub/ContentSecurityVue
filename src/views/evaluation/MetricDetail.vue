<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEvaluationStore } from '../../stores/evaluation'
import { evaluationApi as api } from '../../api/evaluation'
import type { MetricRevision, RevisionDefinition } from '../../types/evaluation'
import { categories, label, threshold, time } from './presentation'
import EvaluationPanel from './components/EvaluationPanel.vue'
import EvaluationStatus from './components/EvaluationStatus.vue'
import MetricRevisionEditor from './components/MetricRevisionEditor.vue'
const route = useRoute()
const router = useRouter()
const store = useEvaluationStore()
const editing = ref(false)
const canWrite = computed(() => store.session?.allowedActions.includes('write'))
function definition(revision: MetricRevision): RevisionDefinition {
  const {
    formulaCode,
    formulaVersion,
    formula,
    denominatorDefinition,
    positiveClass,
    unit,
    testMethod,
    applicableObjects,
    parameters,
    thresholds,
    inputRequirements,
    requiredEvidence,
    sourceDocumentRefs,
  } = revision
  return {
    formulaCode,
    formulaVersion,
    formula,
    denominatorDefinition,
    positiveClass,
    unit,
    testMethod,
    applicableObjects,
    parameters,
    thresholds,
    inputRequirements,
    requiredEvidence,
    sourceDocumentRefs,
  }
}
async function load() {
  let metricId = String(route.query.metricId || '')
  if (!metricId && route.query.metricCode) {
    await store.fetchData(
      'metric-resolution',
      (signal) => api.metrics({ keyword: String(route.query.metricCode), pageSize: 100 }, signal),
      (data) => {
        const matches = data.items.filter((m) => m.code === route.query.metricCode)
        if (matches.length === 1) metricId = matches[0]!.metricId
      },
    )
  }
  if (!metricId) {
    store.error = '指定指标不存在。'
    return
  }
  await store.fetchData(
    'revisions',
    (signal) => api.revisions(metricId, signal),
    (data) => {
      store.revisions = data.items
    },
  )
  const revisionId = String(route.query.revisionId || store.revisions[0]?.revisionId || '')
  if (revisionId)
    await store.fetchData(
      'revision',
      (signal) => api.revision(metricId, revisionId, signal),
      (data) => {
        store.revision = data
      },
    )
}
async function save(data: RevisionDefinition) {
  const revision = store.revision
  if (!revision) return
  const updated = await store.write('patch:' + revision.revisionId, data, (key) =>
    api.patchRevision(revision.metricId, revision.revisionId, data, revision.expectedRevision, key),
  )
  if (updated) {
    store.revision = updated
    editing.value = false
    await load()
  }
}
async function publish() {
  const revision = store.revision
  if (!revision) return
  if (
    await store.write('publish:' + revision.revisionId, revision.expectedRevision, (key) =>
      api.publish(revision.metricId, revision.revisionId, revision.expectedRevision, key),
    )
  )
    await load()
}
async function revise() {
  const revision = store.revision
  if (!revision) return
  const created = await store.write('revise:' + revision.revisionId, definition(revision), (key) =>
    api.revise(revision.metricId, definition(revision), key),
  )
  if (created)
    await router.push({
      path: '/evaluation/metrics',
      query: { metricId: created.metricId, revisionId: created.revisionId },
    })
}
onMounted(load)
</script>
<template>
  <div class="ev-actions">
    <el-button @click="router.push('/evaluation/metrics')">← 返回指标库</el-button
    ><el-button @click="load">刷新</el-button>
  </div>
  <el-skeleton v-if="store.loading && !store.revision" :rows="8" animated />
  <div v-if="store.revision" class="ev-columns">
    <EvaluationPanel
      :title="store.revision.name"
      :subtitle="`${categories[store.revision.category]} · 修订 r${store.revision.revisionNo}`"
    >
      <template #actions><EvaluationStatus :value="store.revision.configurationStatus" /></template>
      <MetricRevisionEditor
        v-if="editing"
        :key="store.revision.revisionId"
        :definition="definition(store.revision)"
        :busy="store.writing"
        @save="save"
        @cancel="editing = false"
      />
      <template v-else>
        <div class="ev-formula">
          {{ store.revision.formula
          }}<small>分母：{{ store.revision.denominatorDefinition || '待定义' }}</small>
        </div>
        <div class="ev-field">
          <span>标准正类</span><b>{{ store.revision.positiveClass || '待定义 / 不适用' }}</b>
        </div>
        <div class="ev-field">
          <span>适用对象</span><span>{{ store.revision.applicableObjects }}</span>
        </div>
        <div class="ev-field">
          <span>计算单位</span
          ><span>{{
            { ratio: '比率', count: '数量', boolean: '全部满足' }[store.revision.unit]
          }}</span>
        </div>
        <div v-for="stage in ['midterm', 'final'] as const" :key="stage" class="ev-field">
          <span>{{ label(stage) }}目标</span
          ><b>{{ threshold(store.revision.thresholds.find((t) => t.stage === stage)) }}</b>
        </div>
        <div v-for="parameter in store.revision.parameters" :key="parameter.name" class="ev-field">
          <span>{{ parameter.name }}</span
          ><span>{{ parameter.value }}</span>
        </div>
        <div class="ev-field">
          <span>所需输入</span
          ><span>{{ store.revision.inputRequirements.map(label).join('、') }}</span>
        </div>
        <div class="ev-field">
          <span>必需证据</span
          ><span>{{ store.revision.requiredEvidence.map(label).join('、') }}</span>
        </div>
        <div class="ev-field">
          <span>生效时间</span><span>{{ time(store.revision.publishedAt) }}</span>
        </div>
        <div class="ev-footer">
          <el-button
            v-if="store.revision.configurationStatus !== 'published'"
            :disabled="!canWrite"
            @click="editing = true"
            >编辑草稿</el-button
          ><el-button
            v-if="store.revision.configurationStatus !== 'published'"
            type="primary"
            :disabled="!canWrite"
            :loading="store.writing"
            @click="publish"
            >发布修订</el-button
          ><el-button
            v-else
            type="primary"
            :disabled="!canWrite"
            :loading="store.writing"
            @click="revise"
            >＋ 创建新修订</el-button
          >
        </div>
      </template>
    </EvaluationPanel>
    <EvaluationPanel title="修订历史" subtitle="历史测试保留创建时的指标定义与阈值。"
      ><div class="ev-revision-list">
        <button
          v-for="revision in store.revisions"
          :key="revision.revisionId"
          @click="
            router.push({
              path: '/evaluation/metrics',
              query: { metricId: revision.metricId, revisionId: revision.revisionId },
            })
          "
        >
          <b>r{{ revision.revisionNo }}</b> · {{ label(revision.configurationStatus) }}
          <p>{{ time(revision.createdAt) }}</p>
        </button>
      </div>
      <div class="ev-note" style="margin-top: 18px">
        已发布定义只读，任何调整都通过新修订发布。
      </div></EvaluationPanel
    >
  </div>
</template>
