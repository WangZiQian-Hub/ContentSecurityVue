<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { evaluationApi as api } from '../../api/evaluation'
import { useEvaluationStore } from '../../stores/evaluation'
import { label, measure, threshold, time, sourceLink } from './presentation'
import EvaluationPanel from './components/EvaluationPanel.vue'
import EvaluationStatus from './components/EvaluationStatus.vue'
const route = useRoute()
const router = useRouter()
const store = useEvaluationStore()
const calculation = computed(() => store.evidence?.material.calculation)
const sourcePath = computed(() => (store.evidence ? sourceLink(store.evidence.sourceRef) : null))
async function load() {
  await store.fetchData(
    'evidence',
    (signal) => api.evidence(String(route.query.evidenceId || ''), signal),
    (evidence) => {
      if (route.query.runId && route.query.runId !== evidence.runId) {
        store.evidence = null
        throw new Error('证据与指定运行不匹配。')
      }
      store.evidence = evidence
    },
  )
  if (store.evidence)
    await store.fetchData(
      'evidence-manifest',
      (signal) => api.manifest(store.evidence!.runId, signal),
      (data) => {
        store.manifest = data
      },
    )
}
onMounted(load)
</script>
<template>
  <div class="ev-actions">
    <el-button
      @click="
        router.push({
          path: '/evaluation/records',
          query: { runId: store.evidence?.runId || String(route.query.runId || '') },
        })
      "
      >← 返回归档记录</el-button
    ><el-button @click="load">重新核验</el-button>
  </div>
  <el-skeleton v-if="store.loading && !store.evidence" :rows="8" animated />
  <div v-if="store.evidence && calculation" class="ev-columns">
    <EvaluationPanel title="测试证据详情" :subtitle="calculation.name"
      ><template #actions
        ><EvaluationStatus :value="calculation.judgmentStatus" judgment
      /></template>
      <div class="ev-formula">
        {{ calculation.formula
        }}<small
          >分子 {{ calculation.numerator ?? '—' }} / 分母
          {{ calculation.denominator ?? '—' }}</small
        ><b>{{ measure(calculation.value, calculation.unit) }}</b
        ><small>冻结阈值 {{ threshold(calculation.thresholdSnapshot) }}</small>
      </div>
      <p v-if="calculation.reasonCode">{{ label(calculation.reasonCode) }}</p>
      <h3 v-if="calculation.counts.length">
        {{
          ['recall', 'accuracy', 'fpr', 'coverage'].includes(calculation.formulaCode)
            ? '分类计数明细'
            : '证据核验明细'
        }}
      </h3>
      <el-table v-if="calculation.counts.length" :data="calculation.counts"
        ><el-table-column prop="name" label="计数项" /><el-table-column prop="value" label="数量"
      /></el-table>
      <h3 style="margin-top: 24px">留痕五要素</h3>
      <div class="ev-checks">
        <span v-for="check in store.manifest?.checks || []" :key="check.name"
          >{{ label(check.name) }} {{ check.valid ? '✓' : '缺失' }}</span
        >
      </div>
      <div class="ev-field">
        <span>证据校验</span><EvaluationStatus :value="store.evidence.integrityState" />
      </div>
      <div class="ev-field">
        <span>证据哈希</span><span class="ev-hash">{{ store.evidence.sha256 }}</span>
      </div>
      <div class="ev-field">
        <span>采集时间</span><span>{{ time(store.evidence.capturedAt) }}</span>
      </div>
      <p class="ev-muted">
        样本原文已脱敏，保留计算所需标签与精确引用。哈希用于复核内容一致性。
      </p> </EvaluationPanel
    ><EvaluationPanel title="精确来源与版本"
      ><div class="ev-field">
        <span>来源名称</span><b>{{ store.evidence.sourceRef.name }}</b>
      </div>
      <div class="ev-field">
        <span>来源编号</span><span>{{ store.evidence.sourceRef.entityId }}</span>
      </div>
      <div class="ev-field">
        <span>来源版本</span><span>{{ store.evidence.sourceRef.versionId }}</span>
      </div>
      <div class="ev-field">
        <span>数据版本</span><span>{{ store.evidence.sourceRef.datasetVersion }}</span>
      </div>
      <div class="ev-field">
        <span>标签版本</span><span>{{ store.evidence.sourceRef.labelVersion }}</span>
      </div>
      <div class="ev-field">
        <span>模型版本</span><span>{{ store.evidence.sourceRef.modelVersion || '不适用' }}</span>
      </div>
      <div class="ev-field">
        <span>算法模式</span><span>{{ label(store.evidence.sourceRef.algorithmMode) }}</span>
      </div>
      <div class="ev-field">
        <span>来源任务</span><span>{{ store.evidence.sourceRef.sourceTaskId }}</span>
      </div>
      <div class="ev-field">
        <span>来源链路</span><span>{{ store.evidence.sourceRef.sourceTraceId }}</span>
      </div>
      <div class="ev-field">
        <span>来源哈希</span><span class="ev-hash">{{ store.evidence.sourceRef.contentHash }}</span>
      </div>
      <div class="ev-footer">
        <router-link v-if="sourcePath" :to="sourcePath">打开来源模块 ↗</router-link>
      </div></EvaluationPanel
    >
  </div>
</template>
