<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { evaluationApi as api } from '../../api/evaluation'
import { useEvaluationStore } from '../../stores/evaluation'
import type { EvaluationTask } from '../../types/evaluation'
import { label, time } from './presentation'
import EvaluationPanel from './components/EvaluationPanel.vue'
import EvaluationStatus from './components/EvaluationStatus.vue'
import EvaluationPager from './components/EvaluationPager.vue'
const store = useEvaluationStore()
const router = useRouter()
const filters = reactive({ keyword: '', status: '', stage: '', page: 1, pageSize: 10 })
const canWrite = computed(() => store.session?.allowedActions.includes('write'))
function filterStatus(state: string) {
  filters.status = state
  void load()
}
function load(page = 1) {
  filters.page = page
  return store.fetchData(
    'tasks',
    (signal) => api.tasks(filters, signal),
    (data) => {
      store.tasks = data
    },
  )
}
async function start(task: EvaluationTask) {
  const started = await store.write('start:' + task.taskId, task.taskId, (key) =>
    api.start(task.taskId, key),
  )
  if (started)
    await router.push({ path: '/evaluation/execution', query: { taskId: started.taskId } })
}
onMounted(() => load())
</script>
<template>
  <div class="ev-summary">
    <button
      v-for="(state, index) in ['pending', 'running', 'failed']"
      :key="state"
      class="ev-summary-card"
      @click="filterStatus(state)"
    >
      <span class="ev-summary-icon">{{ ['◷', '▷', '!'][index] }}</span>
      <div>
        {{ label(state)
        }}<b>{{ store.tasks?.summary.find((s) => s.name === state)?.value ?? '—' }}</b>
      </div>
    </button>
  </div>
  <EvaluationPanel title="测试任务管理" subtitle="管理执行计划与运行状态">
    <template #actions
      ><el-button
        type="primary"
        :disabled="!canWrite"
        @click="router.push({ path: '/evaluation/tasks', query: { view: 'new' } })"
        >＋ 新建测试任务</el-button
      ></template
    >
    <div class="ev-toolbar">
      <el-input
        v-model="filters.keyword"
        placeholder="搜索任务名称"
        clearable
        @keyup.enter="load()"
        @clear="load()"
      /><el-select v-model="filters.status" clearable placeholder="全部状态" @change="load()"
        ><el-option
          v-for="state in ['pending', 'running', 'succeeded', 'failed', 'cancelled']"
          :key="state"
          :label="label(state)"
          :value="state" /></el-select
      ><el-select v-model="filters.stage" clearable placeholder="全部阶段" @change="load()"
        ><el-option label="中期" value="midterm" /><el-option
          label="完成期"
          value="final" /></el-select
      ><el-button @click="load()">查询 / 刷新</el-button>
    </div>
    <el-table
      v-loading="store.loading"
      :data="store.tasks?.items || []"
      empty-text="暂无测试任务，创建计划后将在这里显示"
    >
      <el-table-column prop="name" label="任务名称" min-width="210" /><el-table-column
        prop="datasetVersion"
        label="测试集版本"
        min-width="130"
      /><el-table-column label="模型版本" min-width="100"
        ><template #default="{ row }">{{ row.modelVersion || '不适用' }}</template></el-table-column
      ><el-table-column prop="metricCount" label="指标数" width="80" /><el-table-column
        label="目标阶段"
        width="100"
        ><template #default="{ row }">{{ label(row.targetStage) }}</template></el-table-column
      ><el-table-column label="执行状态" width="120"
        ><template #default="{ row }"
          ><EvaluationStatus :value="row.status" /></template></el-table-column
      ><el-table-column label="创建时间" min-width="165"
        ><template #default="{ row }">{{ time(row.createdAt) }}</template></el-table-column
      >
      <el-table-column label="操作" width="150" fixed="right"
        ><template #default="{ row }"
          ><el-button
            v-if="row.allowedActions.includes('start')"
            link
            type="primary"
            :disabled="store.writing"
            @click="start(row)"
            >启动</el-button
          ><el-button
            link
            type="primary"
            @click="
              router.push({
                path: row.status === 'succeeded' ? '/evaluation/results' : '/evaluation/execution',
                query: row.status === 'succeeded' ? { runId: row.runId } : { taskId: row.taskId },
              })
            "
            >{{ row.status === 'succeeded' ? '查看结果' : '查看执行' }}</el-button
          ></template
        ></el-table-column
      > </el-table
    ><EvaluationPager :total="store.tasks?.total || 0" :page="filters.page" @change="load" />
    <div class="ev-note" style="margin-top: 18px">
      执行完成仅表示流程结束，逐项验收结论请查看测试结果。任务创建时冻结输入版本、样本清单与指标修订。
    </div>
  </EvaluationPanel>
</template>
