// “数据资源统计” 子页面
<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import PanelCard from '../../components/PanelCard.vue'
import ResourceChart from './components/ResourceChart.vue'
import DistributionBars from './components/DistributionBars.vue'
import { useDataResourceStore } from '../../stores/data-resource'
import { isMock } from '../../api/request'
import type { StatisticsQuery } from '../../types/data-resource'
const store = useDataResourceStore()
const dates = ref<[string, string]>()
const filters = reactive<StatisticsQuery>({ sourceType: '', language: '' })
const summary = computed(() => store.summary)
async function search() {
  if (isMock) {
    ElMessage.info('示例模式展示固定统计快照；筛选查询需连接后端。')
    return
  }
  await store.loadSummary('statistics', {
    ...filters,
    startDate: dates.value?.[0],
    endDate: dates.value?.[1],
  })
}
function exportReport() {
  if (!summary.value) return
  const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
  const rows: (string | number)[][] = [
    ['数据资源统计报表', isMock ? '示例数据' : '后端数据'],
    ['生成时间', new Date().toISOString()],
    ['指标', '数值', '单位'],
    ...summary.value.kpis.map((item) => [item.label, item.value, item.unit]),
    [],
    ['数据集', '来源', '存储量(GB)', '使用次数', '使用占比(%)'],
    ...summary.value.ranking.map((item) => [
      item.name,
      item.source,
      item.storageGb,
      item.uses,
      item.share,
    ]),
  ]
  const url = URL.createObjectURL(
    new Blob(['\uFEFF' + rows.map((row) => row.map(escape).join(',')).join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `数据资源统计${isMock ? '-示例' : ''}.csv`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>
<template>
  <div class="resource-statistics-filter">
    <el-date-picker
      v-model="dates"
      type="daterange"
      range-separator="至"
      start-placeholder="开始日期"
      end-placeholder="结束日期"
      value-format="YYYY-MM-DD"
    /><el-select
      v-model="filters.sourceType"
      clearable
      placeholder="全部来源"
      aria-label="统计数据来源"
      ><el-option label="互联网" value="internet" /><el-option
        label="业务数据"
        value="business" /><el-option label="行业数据" value="industry" /></el-select
    ><el-select v-model="filters.language" clearable placeholder="全部语言" aria-label="统计语言"
      ><el-option label="中文" value="zh" /><el-option label="英文" value="en" /><el-option
        label="日文"
        value="ja" /></el-select
    ><el-button type="primary" :loading="store.loading" @click="search">查询</el-button
    ><el-button :disabled="!summary" @click="exportReport">↓ 导出报表</el-button>
  </div>
  <div class="resource-statistics-top">
    <PanelCard title="数据增长趋势" icon="TrendCharts"
      ><ResourceChart kind="line" :trend="summary?.trend" cumulative :height="235" /></PanelCard
    ><PanelCard title="数据来源分布" icon="PieChart"
      ><ResourceChart
        kind="donut"
        donut-layout="spacious"
        :data="summary?.sources"
        :center-text="`${summary?.kpis.find((item) => item.id === 'storage')?.value ?? '—'} TB`"
        :height="235" /></PanelCard
    ><PanelCard title="数据模态分布" icon="Grid"
      ><DistributionBars :data="summary?.modalities ?? []"
    /></PanelCard>
  </div>
  <div class="resource-statistics-bottom">
    <PanelCard title="语言分布" icon="Document"
      ><DistributionBars :data="summary?.languages ?? []" /></PanelCard
    ><PanelCard title="数据质量概览" icon="Location"
      ><div class="resource-quality">
        <ResourceChart kind="radar" :data="summary?.quality" :height="210" />
        <div>
          <span>综合评分</span><b>{{ summary?.qualityScore ?? '—' }}</b
          ><span>/ 100</span>
        </div>
      </div></PanelCard
    ><PanelCard title="数据问题统计" icon="Grid"
      ><div v-for="(item, index) in summary?.issues" :key="item.name" class="resource-issue">
        <i :class="{ danger: index > 1 }">{{ index > 1 ? '!' : '≡' }}</i
        ><span>{{ item.name }}</span
        ><b>{{ item.value.toLocaleString() }}</b
        ><span class="resource-issue-track"
          ><i :style="{ width: `${Math.max(8, 90 - index * 22)}%` }"
        /></span></div
    ></PanelCard>
  </div>
  <PanelCard title="数据集使用排行" icon="List" link="/data-resource/datasets"
    ><el-table :data="summary?.ranking ?? []" empty-text="暂无统计数据"
      ><el-table-column type="index" label="排名" width="75" /><el-table-column
        prop="name"
        label="数据集名称"
        min-width="220" /><el-table-column
        prop="source"
        label="数据来源"
        min-width="130" /><el-table-column label="数据量" min-width="120"
        ><template #default="{ row }">{{ row.storageGb }} GB</template></el-table-column
      ><el-table-column label="使用次数" min-width="120"
        ><template #default="{ row }">{{ row.uses.toLocaleString() }}</template></el-table-column
      ><el-table-column label="使用占比" min-width="220"
        ><template #default="{ row }"
          ><el-progress
            :percentage="row.share"
            :stroke-width="8" /></template></el-table-column></el-table
  ></PanelCard>
</template>
