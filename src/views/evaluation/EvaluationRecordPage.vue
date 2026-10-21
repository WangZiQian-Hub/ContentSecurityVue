<script setup lang="ts">
import { onMounted, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { evaluationApi as api } from '../../api/evaluation'
import { useEvaluationStore } from '../../stores/evaluation'
import { label, time } from './presentation'
import EvaluationPanel from './components/EvaluationPanel.vue'
import EvaluationStatus from './components/EvaluationStatus.vue'
import EvaluationPager from './components/EvaluationPager.vue'
import EvaluationExport from './components/EvaluationExport.vue'
const store = useEvaluationStore()
const route = useRoute()
const router = useRouter()
const filters = reactive({
  keyword: '',
  judgmentStatus: '',
  integrityState: '',
  from: '',
  to: '',
  page: 1,
  pageSize: 10,
})
const hasExport = (row: { exports?: { state: string; kind: string }[] }) =>
  row.exports?.some((job) => job.kind === 'report' && job.state === 'succeeded')
/** 测试集展示：优先「名字 版本」，回落原版本串，再回落未记录。 */
function datasetCell(snapshot: Record<string, string> | undefined) {
  const s = snapshot || {}
  if (s.datasetName && s.datasetVersion) return `${s.datasetName} ${s.datasetVersion}`
  return s.datasetName || s.datasetVersion || '未记录'
}
/** 模型版本展示：桥接记录显「模型名 基线 → 编辑后」，其余回落 modelVersion。 */
function modelCell(snapshot: Record<string, string> | undefined) {
  const s = snapshot || {}
  if (s.baselineVersion && s.editedVersion) {
    const name = s.modelName ? `${s.modelName} ` : ''
    return `${name}${s.baselineVersion} → ${s.editedVersion}`
  }
  return s.modelName ? `${s.modelName} ${s.modelVersion || ''}`.trim() : s.modelVersion || '不适用'
}
/** 任务编号：桥接记录取来源能力任务 tsk_xxx，工作区任务取自身 eval_task_xxx。 */
function taskCell(row: { config?: Record<string, string>; taskId?: string }) {
  return row.config?.capabilityTaskId || row.taskId || '—'
}
/** 桥接记录带来源模型 ID，可回跳模型训推评估页复现现场。 */
function sourceModelId(row: { config?: Record<string, string>; snapshot?: Record<string, string> }) {
  return row.config?.source === 'model-train/evaluation' ? row.snapshot?.modelId || '' : ''
}
const resolutionLabels = {
  not_found: '未找到此来源记录，未选择其他运行。',
  ambiguous: '此来源记录关联多个运行，请明确选择。',
  conflict: '来源记录与运行的关联发生冲突，请核查。',
  demo_only: '这是演示记录，不能作为真实测试归档。',
  resolved: '来源记录已解析。',
}
function queryParams() {
  return {
    keyword: filters.keyword.trim(),
    judgmentStatus: filters.judgmentStatus,
    integrityState: filters.integrityState,
    from: filters.from,
    to: filters.to,
    page: filters.page,
    pageSize: filters.pageSize,
  }
}
function loadList(page = 1) {
  filters.page = page
  return store.fetchData(
    'records',
    // Do not pass Vue's reactive proxy to Axios.  Send a plain snapshot so
    // the keyword entered immediately before clicking 查询 is always serialized.
    (signal) => api.records(queryParams(), signal),
    (data) => {
      store.runs = data
    },
  )
}
async function select(runId: string) {
  await store.fetchData(
    'record-run',
    (signal) => api.run(runId, signal),
    (data) => {
      store.run = data
    },
  )
  await store.fetchData(
    'manifest',
    (signal) => api.manifest(runId, signal),
    (data) => {
      store.manifest = data
    },
  )
}
async function load() {
  if (route.query.recordId) {
    await store.fetchData(
      'resolution',
      (signal) => api.resolveRecord(String(route.query.recordId), signal),
      (data) => {
        store.resolution = data
      },
    )
    if (store.resolution?.resolution === 'resolved' && store.resolution.runId)
      await select(store.resolution.runId)
  } else if (route.query.runId) await select(String(route.query.runId))
  await loadList(filters.page)
}
onMounted(load)
</script>
<template>
  <EvaluationPanel title="测试记录与报告" subtitle="按运行归档，保留历史版本与每次尝试。"
    ><template #actions><el-button @click="load">刷新</el-button></template>
    <div v-if="store.resolution" class="ev-note" style="margin-bottom: 18px">
      {{ resolutionLabels[store.resolution.resolution] }}
      <div v-if="store.resolution.resolution === 'ambiguous'">
        <el-button
          v-for="candidate in store.resolution.candidates"
          :key="candidate.runId"
          link
          type="primary"
          @click="router.push({ path: '/evaluation/records', query: { runId: candidate.runId } })"
          >{{ candidate.runId }}</el-button
        >
      </div>
    </div>
    <div class="ev-toolbar">
      <el-input
        v-model="filters.keyword"
        clearable
        placeholder="搜索测试名称"
        @keyup.enter="loadList()"
      /><el-select
        v-model="filters.judgmentStatus"
        clearable
        placeholder="全部结论"
        @change="loadList()"
        ><el-option
          v-for="state in ['passed', 'failed', 'inconclusive']"
          :key="state"
          :value="state"
          :label="state === 'failed' ? '未达标' : label(state)" /></el-select
      ><el-select
        v-model="filters.integrityState"
        clearable
        placeholder="全部留痕状态"
        @change="loadList()"
        ><el-option label="完整" value="complete" /><el-option
          label="不完整"
          value="incomplete" /></el-select
      ><el-date-picker
        v-model="filters.from"
        value-format="YYYY-MM-DD"
        placeholder="开始日期"
        @change="loadList()"
      /><el-date-picker
        v-model="filters.to"
        value-format="YYYY-MM-DD"
        placeholder="结束日期"
        @change="loadList()"
      /><el-button @click="loadList()">查询</el-button>
    </div>
    <el-table v-loading="store.loading" :data="store.runs?.items || []" empty-text="暂无已归档运行"
      ><el-table-column label="测试名称" min-width="190" show-overflow-tooltip
        ><template #default="{ row }"
          ><b>{{ row.name }}</b></template
        ></el-table-column
      ><el-table-column label="任务编号" min-width="160"
        ><template #default="{ row }"
          ><span class="ev-task-id">{{ taskCell(row) }}</span>
          <el-button
            v-if="sourceModelId(row)"
            link
            type="primary"
            size="small"
            @click="
              router.push({
                path: '/model-train/evaluation',
                query: { modelId: sourceModelId(row), recordId: row.recordId },
              })
            "
            >回跳</el-button
          ></template
        ></el-table-column
      ><el-table-column label="测试集" min-width="180" show-overflow-tooltip
        ><template #default="{ row }">{{ datasetCell(row.snapshot) }}</template></el-table-column
      ><el-table-column label="模型版本" min-width="220" show-overflow-tooltip
        ><template #default="{ row }">{{ modelCell(row.snapshot) }}</template></el-table-column
      ><el-table-column label="验收结论" width="100"
        ><template #default="{ row }"
          ><EvaluationStatus :value="row.judgmentStatus" judgment /></template></el-table-column
      ><el-table-column label="留痕状态" width="100"
        ><template #default="{ row }"
          ><EvaluationStatus :value="row.integrityState" /></template></el-table-column
      ><el-table-column label="报告状态" width="100"
        ><template #default="{ row }">{{
          hasExport(row) ? '已生成' : '尚未生成'
        }}</template></el-table-column
      ><el-table-column label="归档时间" width="165"
        ><template #default="{ row }">{{ time(row.finishedAt) }}</template></el-table-column
      ><el-table-column label="操作" width="80" fixed="right"
        ><template #default="{ row }"
          ><el-button
            link
            type="primary"
            @click="router.push({ path: '/evaluation/records', query: { runId: row.runId } })"
            >查看</el-button
          ></template
        ></el-table-column
      ></el-table
    ><EvaluationPager :total="store.runs?.total || 0" :page="filters.page" @change="loadList" />
  </EvaluationPanel>
  <EvaluationPanel v-if="store.run && store.manifest" :title="store.run.name + ' · 归档材料'"
    ><template #actions
      ><el-button
        @click="router.push({ path: '/evaluation/results', query: { runId: store.run.runId } })"
        >查看结果</el-button
      ><el-button
        v-if="store.run.retryOf"
        @click="router.push({ path: '/evaluation/records', query: { runId: store.run.retryOf } })"
        >前次尝试</el-button
      ></template
    >
    <div class="ev-checks">
      <span v-for="check in store.manifest.checks" :key="check.name"
        >{{ label(check.name) }} {{ check.valid ? '✓' : '缺失' }}</span
      >
    </div>
    <el-table :data="store.manifest.entries" empty-text="此运行尚无完整证据"
      ><el-table-column label="指标" min-width="200"
        ><template #default="{ row }">{{
          row.material.calculation.name
        }}</template></el-table-column
      ><el-table-column label="SHA-256" min-width="320"
        ><template #default="{ row }"
          ><span class="ev-hash">{{ row.sha256 }}</span></template
        ></el-table-column
      ><el-table-column label="校验" width="110"
        ><template #default="{ row }"
          ><EvaluationStatus :value="row.integrityState" /></template></el-table-column
      ><el-table-column label="操作" width="110"
        ><template #default="{ row }"
          ><el-button
            link
            type="primary"
            @click="
              router.push({
                path: '/evaluation/records',
                query: { runId: store.run!.runId, evidenceId: row.evidenceId },
              })
            "
            >证据详情</el-button
          ></template
        ></el-table-column
      ></el-table
    >
    <div class="ev-footer">
      <EvaluationExport
        :run-id="store.run.runId"
        :allowed="
          store.run.allowedActions.includes('export') &&
          store.manifest.integrityState === 'complete'
        "
        :jobs="store.runs?.items.find((r) => r.runId === store.run?.runId)?.exports"
        @updated="loadList(filters.page)"
      />
    </div>
  </EvaluationPanel>
</template>
<style scoped>
.ev-task-id {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 13px;
  color: #476590;
}
</style>
