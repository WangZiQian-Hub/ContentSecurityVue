<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus, VideoPlay } from '@element-plus/icons-vue'
import type { EChartsOption } from 'echarts'
import PanelCard from '../../components/PanelCard.vue'
import WorkbenchKpis from './WorkbenchKpis.vue'
import WorkbenchChart from './WorkbenchChart.vue'
import { useModelWorkbench } from '../../stores/model-workbench'
import { percent } from '../../types/model-workbench'
import { isMock } from '../../api/request'
const store = useModelWorkbench(),
  route = useRoute()
onMounted(() => {
  // 从模型训练页切换进来时，确保读取后端最新的评估聚合结果。
  if (!isMock) void store.load()
})
const modelId = ref(
  String(route.query.modelId || store.data.assessment?.modelId || store.data.models[0]?.id || ''),
)
const baseline = ref(''),
  edited = ref('')
const datasetId = ref(
  store.data.assessment?.datasetId ||
    store.data.datasets.find((d) => d.purpose === 'evaluation')?.id ||
    '',
)
const model = computed(() => store.data.models.find((m) => m.id === modelId.value))
const dataset = computed(() => store.data.datasets.find((d) => d.id === datasetId.value))
watch(
  model,
  (m) => {
    baseline.value = m?.version || ''
    edited.value = m?.versions.find((v) => v.version !== baseline.value)?.version || ''
  },
  { immediate: true },
)
const result = computed(() => {
  const r = store.data.assessment
  return r &&
    r.modelId === modelId.value &&
    r.baseline === baseline.value &&
    r.edited === edited.value &&
    r.datasetId === datasetId.value &&
    r.datasetVersion === dataset.value?.version
    ? r
    : null
})
const latestEditTask = computed(() =>
  store.editTasks.find((task) => task.modelId === modelId.value),
)
const kpis = computed(() => {
  const r = result.value
  return [
    {
      label: '本次评估样本',
      value: r ? r.riskTotal + r.targetTotal + r.generalTotal + r.retentionTotal : '暂无',
      unit: '条',
      icon: 'Document',
    },
    {
      label: '风险样本减少率',
      value: r ? percent(r.riskBefore - r.riskAfter, r.riskBefore) : '暂无',
      icon: 'Bottom',
    },
    {
      label: '非目标能力保持率',
      value: r ? percent(r.retentionAfter, r.retentionBefore) : '暂无',
      icon: 'Shield',
    },
    {
      label: '编辑目标成功率',
      value: r ? percent(r.targetAfter, r.targetTotal) : '暂无',
      icon: 'Aim',
    },
    {
      label: '泛化测试成功率',
      value: r ? percent(r.generalAfter, r.generalTotal) : '暂无',
      icon: 'Share',
    },
  ]
})
const chart = computed<EChartsOption>(() => ({
  color: ['#388cff', '#2dcc9e'],
  tooltip: { trigger: 'axis' },
  legend: { data: ['基线版本', '编辑后版本'], right: 0 },
  grid: { left: 120, right: 35, top: 45, bottom: 30 },
  xAxis: { type: 'value', minInterval: 1 },
  yAxis: {
    type: 'category',
    inverse: true,
    data: ['风险输出样本', '目标编辑成功样本', '泛化成功样本'],
  },
  series: [
    {
      name: '基线版本',
      type: 'bar',
      data: result.value
        ? [result.value.riskBefore, result.value.targetBefore, result.value.generalBefore]
        : [],
      label: { show: true, position: 'right' },
      barMaxWidth: 20,
    },
    {
      name: '编辑后版本',
      type: 'bar',
      data: result.value
        ? [result.value.riskAfter, result.value.targetAfter, result.value.generalAfter]
        : [],
      label: { show: true, position: 'right' },
      barMaxWidth: 20,
    },
  ],
}))
const dialog = ref(false),
  knowledge = ref('未经授权的个人信息披露')
async function assess() {
  if (
    !model.value ||
    !baseline.value ||
    !edited.value ||
    baseline.value === edited.value ||
    !dataset.value
  )
    return void ElMessage.warning('请选择不同的模型版本和固定测试集')
  try {
    ElMessage.success(
      await store.assess({
        modelId: modelId.value,
        baseline: baseline.value,
        edited: edited.value,
        datasetId: datasetId.value,
        datasetVersion: dataset.value.version,
      }),
    )
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '评估失败')
  }
}
function submitEdit() {
  if (!knowledge.value.trim() || !model.value)
    return void ElMessage.warning('请填写目标知识并选择模型')
  // 关闭弹窗并让结果区立即进入空态；任务完成后由 store 在五秒后自动刷新。
  dialog.value = false
  ElMessage.success('已提交')
  void store.editKnowledge(modelId.value, knowledge.value.trim(), baseline.value).catch((e) => {
    ElMessage.error(e instanceof Error ? e.message : '编辑失败')
  })
}
</script>
<template>
  <WorkbenchKpis :items="kpis" />
  <div class="mw-comparison-toolbar">
    <label
      >评估模型<el-select v-model="modelId" aria-label="评估模型"
        ><el-option
          v-for="m in store.data.models"
          :key="m.id"
          :value="m.id"
          :label="m.name" /></el-select></label
    ><label
      >基线版本<el-select v-model="baseline" aria-label="基线版本"
        ><el-option
          v-for="v in model?.versions"
          :key="v.version"
          :value="v.version" /></el-select></label
    ><label
      >编辑后版本<el-select v-model="edited" aria-label="编辑后版本"
        ><el-option
          v-for="v in model?.versions"
          :key="v.version"
          :value="v.version"
          :disabled="v.version === baseline" /></el-select></label
    ><label
      >测试集<el-select v-model="datasetId" aria-label="测试集"
        ><el-option
          v-for="d in store.data.datasets.filter((d) => d.purpose === 'evaluation')"
          :key="d.id"
          :value="d.id"
          :label="`${d.name} ${d.version}`" /></el-select></label
    ><el-button type="primary" :icon="VideoPlay" :loading="store.busy" @click="assess"
      >发起评估</el-button
    ><router-link :to="{ path: '/evaluation/records', query: { recordId: result?.id } }"
      ><el-button>查看测试记录</el-button></router-link
    >
  </div>
  <div class="mw-evaluation-grid">
    <PanelCard title="风险知识编辑" icon="Setting"
      ><el-descriptions :column="1" border
        ><el-descriptions-item label="任务编号">{{
          latestEditTask?.id || result?.taskId || '暂无关联任务'
        }}</el-descriptions-item
        ><el-descriptions-item label="目标知识">{{
          latestEditTask?.knowledge || result?.knowledge || '尚未编辑'
        }}</el-descriptions-item
        ><el-descriptions-item label="编辑方式">定向抑制</el-descriptions-item
        ><el-descriptions-item label="状态"
          ><el-tag :type="latestEditTask ? 'warning' : result ? 'success' : 'info'">{{
            latestEditTask
              ? latestEditTask.status
              : result
                ? isMock
                  ? '已完成（模拟）'
                  : '已有评估结果'
                : '待评估'
          }}</el-tag></el-descriptions-item
        ></el-descriptions
      >
      <p class="mw-paragraph">降低输出个人联系方式的倾向，保持普通问答能力。</p>
      <div
        v-for="task in store.editTasks.filter((t) => t.modelId === modelId)"
        :key="task.id"
        class="mw-info-strip"
      >
        {{ task.id }} · {{ task.status }}<br />{{ task.knowledge }}
      </div>
      <el-button class="mw-full" type="primary" :icon="Plus" @click="dialog = true"
        >新建编辑任务</el-button
      >
      <div class="mw-info-strip">
        关联版本 {{ baseline || '未选择' }} → {{ edited || '未选择' }}
      </div>
      <router-link class="mw-link" :to="{ path: '/compliance/neuron-audit', query: { modelId } }"
        >神经元审计 →</router-link
      ></PanelCard
    >
    <PanelCard title="编辑前后效果" icon="Histogram"
      ><template v-if="result"
        ><div v-if="store.assessmentStale" class="mw-info-strip">
          当前展示的是上一次评估结果。编辑任务完成后，请点击“发起评估”生成本次编辑的新结果。
        </div
        ><WorkbenchChart :option="chart" label="编辑前后风险输出、目标编辑与泛化成功样本数对比" />
        <div class="mw-info-strip">
          同一安全测试子集 {{ result.riskTotal }} 条<br />风险率
          {{ percent(result.riskBefore, result.riskTotal) }} →
          {{ percent(result.riskAfter, result.riskTotal) }}<br />风险样本减少率：{{
            result.riskBefore === 0
              ? '不适用（基线无风险样本）'
              : `(${result.riskBefore} - ${result.riskAfter}) / ${result.riskBefore} = ${percent(result.riskBefore - result.riskAfter, result.riskBefore)}`
          }}
        </div>
        <p class="mw-footnote">
          目标编辑 {{ result.targetTotal }} 条 · 泛化测试 {{ result.generalTotal }} 条
        </p></template
      ><el-empty v-else description="当前版本组合暂无评估结果"
    /></PanelCard>
    <PanelCard title="非目标能力保持" icon="Shield"
      ><template v-if="result"
        ><div v-if="store.assessmentStale" class="mw-info-strip">
          上次评估数据待更新；本次编辑的能力保持率以重新发起评估后的结果为准。
        </div
        ><div class="mw-retention">
          <span>非目标能力保持率</span
          ><strong>{{ percent(result.retentionAfter, result.retentionBefore) }}</strong>
        </div>
        <el-descriptions :column="1" border
          ><el-descriptions-item label="基线正确"
            >{{ result.retentionBefore }} 条</el-descriptions-item
          ><el-descriptions-item label="编辑后正确"
            >{{ result.retentionAfter }} 条</el-descriptions-item
          ><el-descriptions-item label="同一能力集"
            >{{ result.retentionTotal }} 条</el-descriptions-item
          ><el-descriptions-item label="保持率分母"
            >{{ result.retentionAfter }} / {{ result.retentionBefore }}</el-descriptions-item
          ></el-descriptions
        >
        <p class="mw-footnote">
          {{ isMock ? '当前为演示口径，正式口径以统一指标库为准。' : '正式口径以统一指标库为准。' }}
        </p></template
      ><el-empty v-else description="暂无能力保持数据"
    /></PanelCard>
  </div>
  <PanelCard title="样例行为对比" icon="Document"
    ><el-table :data="result?.samples || []" border empty-text="暂无样例对比"
      ><el-table-column prop="type" label="测试类型" width="130" /><el-table-column
        prop="input"
        label="测试输入"
        min-width="200" /><el-table-column
        prop="before"
        :label="`编辑前（${baseline || '未选择'}）`"
        min-width="230" /><el-table-column
        prop="after"
        :label="`编辑后（${edited || '未选择'}）`"
        min-width="230"
    /></el-table>
    <div v-if="result" class="mw-info-strip">
      关联测试记录 {{ result.id }} · 正式指标与报告在测试评估查看。
    </div></PanelCard
  >
  <el-dialog v-model="dialog" title="新建风险知识编辑任务" width="520px" class="mw-dialog"
    ><el-form label-width="90px"
      ><el-form-item label="模型">{{ model?.name }} {{ baseline }}</el-form-item
      ><el-form-item label="目标知识" required
        ><el-input v-model="knowledge" type="textarea" :rows="4" maxlength="1000" /></el-form-item
      ><el-form-item label="编辑方式">定向抑制</el-form-item></el-form
    ><template #footer
      ><el-button @click="dialog = false">取消</el-button
      ><el-button type="primary" @click="submitEdit"
        >提交编辑任务</el-button
      ></template
    ></el-dialog
  >
</template>
