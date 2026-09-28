<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { evaluationApi as api } from '../../api/evaluation'
import { useEvaluationStore } from '../../stores/evaluation'
import type { MetricResult } from '../../types/evaluation'
import { label, measure, threshold, time, sourceLink } from './presentation'
import EvaluationPanel from './components/EvaluationPanel.vue'
import EvaluationStatus from './components/EvaluationStatus.vue'
import EvaluationPager from './components/EvaluationPager.vue'
import EvaluationExport from './components/EvaluationExport.vue'
const route = useRoute()
const router = useRouter()
const store = useEvaluationStore()
const runId = String(route.query.runId || '')
const page = ref(1)
const samplePage = ref(1)
const metricCode = ref('')
const source = computed(() => store.run?.snapshot.resolvedRefs[0])
const sourcePath = computed(() => (source.value ? sourceLink(source.value) : null))
function selectMetric(code: string) {
  metricCode.value = code
  void loadSamples()
}
function loadCandidates(next = 1) {
  page.value = next
  return store.fetchData(
    'runs',
    (signal) => api.runs({ page: next, pageSize: 10, terminalOnly: true }, signal),
    (data) => {
      store.runs = data
    },
  )
}
async function load() {
  if (!runId) {
    await loadCandidates()
    return
  }
  await store.fetchData(
    'run',
    (signal) => api.run(runId, signal),
    (data) => {
      store.run = data
    },
  )
}
async function loadSamples(next = 1) {
  samplePage.value = next
  store.samples = null
  await store.fetchData(
    'samples',
    (signal) => api.samples(runId, metricCode.value, next, signal),
    (data) => {
      store.samples = data
    },
  )
}
function gap(result: MetricResult) {
  if (result.gap == null) return '—'
  if (result.unit === 'ratio')
    return `${result.gap >= 0 ? '高于' : '低于'}阈值 ${Math.abs(result.gap * 100).toLocaleString(
      'zh-CN',
      { maximumSignificantDigits: 8 },
    )} 个百分点`
  return `${result.gap >= 0 ? '+' : ''}${result.gap}`
}
onMounted(load)
</script>
<template>
  <EvaluationPanel
    v-if="!runId"
    title="选择测试结果"
    subtitle="只列出已结束的运行，不自动选择其他记录。"
    ><template #actions><el-button @click="loadCandidates(page)">刷新</el-button></template
    ><el-table
      v-loading="store.loading"
      :data="store.runs?.items || []"
      empty-text="暂无已结束的测试"
      ><el-table-column prop="name" label="测试名称" min-width="240" /><el-table-column
        label="执行状态"
        ><template #default="{ row }"
          ><EvaluationStatus :value="row.taskStatus" /></template></el-table-column
      ><el-table-column label="验收结论"
        ><template #default="{ row }"
          ><EvaluationStatus :value="row.judgmentStatus" judgment /></template></el-table-column
      ><el-table-column label="操作"
        ><template #default="{ row }"
          ><el-button
            link
            type="primary"
            @click="router.push({ path: '/evaluation/results', query: { runId: row.runId } })"
            >查看结果</el-button
          ></template
        ></el-table-column
      ></el-table
    ><EvaluationPager :total="store.runs?.total || 0" :page="page" @change="loadCandidates"
  /></EvaluationPanel>
  <template v-else
    ><div class="ev-actions">
      <el-button @click="router.push('/evaluation/results')">← 选择其他结果</el-button
      ><el-button @click="load">刷新</el-button>
    </div>
    <el-skeleton v-if="store.loading && !store.run" :rows="8" animated />
    <template v-if="store.run"
      ><EvaluationPanel
        :title="store.run.name"
        :subtitle="`${label(store.run.snapshot.targetStage)} · ${time(store.run.finishedAt)}`"
        ><template #actions
          ><EvaluationStatus :value="store.run.taskStatus" /><el-button
            @click="router.push({ path: '/evaluation/records', query: { runId } })"
            >查看归档与证据</el-button
          ></template
        >
        <div class="ev-banner" :class="store.run.judgmentStatus">
          <EvaluationStatus :value="store.run.judgmentStatus" judgment /><b>{{
            store.run.judgmentStatus === 'passed'
              ? '全部必选指标已达标'
              : store.run.judgmentStatus === 'failed'
                ? '存在未达标指标，请逐项复核'
                : '材料或运行尚不足以给出完整验收结论'
          }}</b>
        </div>
        <p v-if="store.run.error">{{ store.run.error }}</p></EvaluationPanel
      >
      <EvaluationPanel title="逐项验收结论"
        ><el-table :data="store.run.metricResults" empty-text="此次运行未产生测量结果"
          ><el-table-column prop="name" label="指标名称" min-width="200" /><el-table-column
            label="实测值"
            min-width="110"
            ><template #default="{ row }"
              ><span :title="String(row.value)">{{ measure(row.value, row.unit) }}</span></template
            ></el-table-column
          ><el-table-column label="冻结阈值" min-width="110"
            ><template #default="{ row }">{{
              threshold(row.thresholdSnapshot)
            }}</template></el-table-column
          ><el-table-column label="阈值差距" min-width="230"
            ><template #default="{ row }"
              >{{ gap(row) }}
              <p v-if="row.reasonCode" class="ev-muted">{{ label(row.reasonCode) }}</p></template
            ></el-table-column
          ><el-table-column label="判定" width="110"
            ><template #default="{ row }"
              ><EvaluationStatus :value="row.judgmentStatus" judgment /></template></el-table-column
          ><el-table-column label="操作" width="170" fixed="right"
            ><template #default="{ row }"
              ><el-button
                v-if="row.evidenceRefs[0]"
                link
                type="primary"
                @click="
                  router.push({
                    path: '/evaluation/records',
                    query: { runId, evidenceId: row.evidenceRefs[0] },
                  })
                "
                >查看计算</el-button
              ><el-button
                v-if="
                  ['accuracy', 'recall', 'coverage', 'fpr', 'risk_reduction'].includes(
                    row.formulaCode,
                  )
                "
                link
                @click="selectMetric(row.metricCode)"
                >失败样本</el-button
              ></template
            ></el-table-column
          ></el-table
        ></EvaluationPanel
      >
      <div class="ev-columns">
        <EvaluationPanel
          title="未达标样本定位"
          subtitle="只读核验标准标签与预测，调整请回来源模块。"
          ><el-empty
            v-if="!metricCode"
            description="选择指标的“失败样本”查看明细"
            :image-size="70" /><template v-else
            ><el-table :data="store.samples?.items || []" empty-text="暂无对应失败样本"
              ><el-table-column prop="sampleId" label="样本编号" /><el-table-column label="标准标签"
                ><template #default="{ row }">{{
                  row.expected === null ? '缺失' : row.expected ? '正类' : '负类'
                }}</template></el-table-column
              ><el-table-column label="预测结果"
                ><template #default="{ row }">{{
                  row.predicted === null ? '缺失' : row.predicted ? '正类' : '负类'
                }}</template></el-table-column
              ></el-table
            ><EvaluationPager
              :total="store.samples?.total || 0"
              :page="samplePage"
              @change="loadSamples" /></template
        ></EvaluationPanel>
        <EvaluationPanel title="测试版本与复测"
          ><div class="ev-field">
            <span>数据版本</span><b>{{ store.run.snapshot.datasetVersion }}</b>
          </div>
          <div class="ev-field">
            <span>标签版本</span><span>{{ store.run.snapshot.labelVersion }}</span>
          </div>
          <div class="ev-field">
            <span>模型版本</span><span>{{ store.run.snapshot.modelVersion || '不适用' }}</span>
          </div>
          <div class="ev-field">
            <span>算法来源</span><span>{{ label(store.run.algorithmMode) }}</span>
          </div>
          <div class="ev-actions" style="margin-top: 20px">
            <router-link v-if="sourcePath" :to="sourcePath">打开来源模块 ↗</router-link
            ><el-button
              type="primary"
              :disabled="!store.session?.allowedActions.includes('write')"
              @click="
                router.push({ path: '/evaluation/tasks', query: { view: 'new', retestOf: runId } })
              "
              >按此配置复测</el-button
            >
          </div></EvaluationPanel
        >
      </div>
      <EvaluationPanel title="报告与证据包"
        ><EvaluationExport
          :run-id="runId"
          :allowed="store.run.allowedActions.includes('export')"
          :jobs="store.run.exports"
      /></EvaluationPanel>
    </template>
  </template>
</template>
