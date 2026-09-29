<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useEvaluationStore } from '../../stores/evaluation'
import { evaluationApi as api } from '../../api/evaluation'
import type { Metric, MetricInput } from '../../types/evaluation'
import { categories, label, threshold } from './presentation'
import EvaluationPanel from './components/EvaluationPanel.vue'
import EvaluationStatus from './components/EvaluationStatus.vue'
import EvaluationPager from './components/EvaluationPager.vue'
const store = useEvaluationStore()
const router = useRouter()
const filters = reactive({
  keyword: '',
  category: '',
  configurationStatus: '',
  page: 1,
  pageSize: 10,
})
const creating = ref(false)
const form = reactive<MetricInput>({ code: '', name: '', category: 'risk_detect', description: '' })
const canWrite = computed(() => store.session?.allowedActions.includes('write'))
function resetFilters() {
  Object.assign(filters, { keyword: '', category: '', configurationStatus: '' })
  void load()
}
function load(page = 1) {
  filters.page = page
  return store.fetchData(
    'metrics',
    (signal) => api.metrics(filters, signal),
    (data) => {
      store.metrics = data
    },
  )
}
function detail(metric: Metric) {
  if (metric.latestRevision)
    void router.push({
      path: '/evaluation/metrics',
      query: { metricId: metric.metricId, revisionId: metric.latestRevision.revisionId },
    })
}
async function create() {
  const metric = await store.write('create-metric', form, (key) => api.createMetric(form, key))
  if (metric) {
    creating.value = false
    Object.assign(form, { code: '', name: '', category: 'risk_detect', description: '' })
    await load(filters.page)
    detail(metric)
  }
}
async function toggle(metric: Metric) {
  const status = metric.status === 'enabled' ? 'disabled' : 'enabled'
  if (
    await store.write('metric-status:' + metric.metricId, status, (key) =>
      api.metricStatus(metric.metricId, status, key),
    )
  )
    await load(filters.page)
}
onMounted(() => load())
</script>
<template>
  <EvaluationPanel
    v-if="creating"
    title="新建验收指标"
    subtitle="先建立草稿，完善计算口径与阶段目标后发布。"
  >
    <el-form label-position="top" class="ev-form-grid" @submit.prevent="create">
      <el-form-item label="指标名称" required
        ><el-input v-model="form.name" maxlength="128"
      /></el-form-item>
      <el-form-item label="指标编码" required
        ><el-input v-model="form.code" placeholder="小写英文、数字及下划线"
      /></el-form-item>
      <el-form-item label="指标类别"
        ><el-select v-model="form.category"
          ><el-option
            v-for="(name, code) in categories"
            :key="code"
            :label="name"
            :value="code" /></el-select
      ></el-form-item>
      <el-form-item label="指标说明"
        ><el-input v-model="form.description" maxlength="512"
      /></el-form-item>
    </el-form>
    <div class="ev-footer">
      <el-button @click="creating = false">取消</el-button
      ><el-button
        type="primary"
        :disabled="!form.name || !/^[a-z][a-z0-9_]{1,63}$/.test(form.code) || !canWrite"
        :loading="store.writing"
        @click="create"
        >创建草稿</el-button
      >
    </div>
  </EvaluationPanel>
  <EvaluationPanel title="验收指标库" subtitle="统一验收口径 · 管理阶段阈值 · 保留历史修订">
    <template #actions
      ><el-button type="primary" :disabled="!canWrite" @click="creating = !creating"
        >＋ 新建指标</el-button
      ></template
    >
    <div class="ev-toolbar">
      <el-input
        v-model="filters.keyword"
        clearable
        placeholder="搜索指标名称或编码"
        aria-label="搜索指标"
        @keyup.enter="load()"
        @clear="load()"
      />
      <el-select v-model="filters.category" placeholder="全部类别" clearable @change="load()"
        ><el-option v-for="(name, code) in categories" :key="code" :label="name" :value="code"
      /></el-select>
      <el-select
        v-model="filters.configurationStatus"
        placeholder="全部配置状态"
        clearable
        @change="load()"
        ><el-option
          v-for="state in ['published', 'draft', 'needs_definition']"
          :key="state"
          :label="label(state)"
          :value="state"
      /></el-select>
      <el-button @click="load()">查询</el-button><el-button @click="resetFilters">重置</el-button>
    </div>
    <el-table
      v-loading="store.loading"
      :data="store.metrics?.items || []"
      empty-text="暂无可显示指标"
    >
      <el-table-column prop="name" label="指标名称" min-width="210" />
      <el-table-column label="类别" min-width="100"
        ><template #default="{ row }">{{
          categories[row.category as keyof typeof categories]
        }}</template></el-table-column
      >
      <el-table-column label="测试方式" min-width="100"
        ><template #default="{ row }">{{
          label(row.latestRevision?.testMethod)
        }}</template></el-table-column
      >
      <el-table-column label="中期阈值" min-width="110"
        ><template #default="{ row }">{{
          threshold((row as Metric).latestRevision?.thresholds.find((t) => t.stage === 'midterm'))
        }}</template></el-table-column
      >
      <el-table-column label="完成期阈值" min-width="110"
        ><template #default="{ row }">{{
          threshold((row as Metric).latestRevision?.thresholds.find((t) => t.stage === 'final'))
        }}</template></el-table-column
      >
      <el-table-column label="修订" width="75"
        ><template #default="{ row }"
          >r{{ row.latestRevision?.revisionNo }}</template
        ></el-table-column
      >
      <el-table-column label="配置状态" width="115"
        ><template #default="{ row }"
          ><EvaluationStatus :value="row.configurationStatus" /><small
            v-if="row.status === 'disabled'"
            class="ev-muted"
          >
            已停用</small
          ></template
        ></el-table-column
      >
      <el-table-column label="操作" width="150" fixed="right"
        ><template #default="{ row }"
          ><el-button link type="primary" @click="detail(row)">查看 / 修订</el-button
          ><el-button link :disabled="!canWrite || store.writing" @click="toggle(row)">{{
            row.status === 'enabled' ? '停用' : '启用'
          }}</el-button></template
        ></el-table-column
      >
    </el-table>
    <EvaluationPager :total="store.metrics?.total || 0" :page="filters.page" @change="load" />
    <div v-if="store.metrics" class="ev-checks">
      <span v-for="item in store.metrics.summary" :key="item.name"
        >{{ label(item.name) }} <b>{{ item.value }}</b></span
      >
    </div>
    <div class="ev-note">
      发布后的指标定义只读。缺少公式、分母或阶段目标的指标，完善后才可用于正式测试。
    </div>
  </EvaluationPanel>
</template>
