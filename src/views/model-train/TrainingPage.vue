<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { EChartsOption } from 'echarts'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import PanelCard from '../../components/PanelCard.vue'
import { useModelWorkbench } from '../../stores/model-workbench'
import { formatModelTime, trainingStates } from '../../types/model-workbench'
import WorkbenchKpis from './WorkbenchKpis.vue'
import WorkbenchChart from './WorkbenchChart.vue'
import { isMock } from '../../api/request'
const store = useModelWorkbench()
const keyword = ref('')
const selectedId = ref(store.data.training[0]?.id)
const selected = computed(() => store.data.training.find((t) => t.id === selectedId.value))
const tasks = computed(() =>
  store.data.training.filter((t) => `${t.name}${trainingStates[t.status]}`.includes(keyword.value)),
)
const kpis = computed(() => [
  { label: '训练任务', value: store.data.training.length, icon: 'Tickets', unit: '项' },
  ...(['running', 'succeeded', 'pending', 'failed'] as const).map((status, i) => ({
    label: trainingStates[status],
    value: store.data.training.filter((t) => t.status === status).length,
    icon: ['VideoPlay', 'CircleCheckFilled', 'Clock', 'CircleCloseFilled'][i]!,
    unit: '项',
  })),
])
const dataset = computed(() => store.data.datasets.find((d) => d.id === selected.value?.datasetId))
const model = computed(() => store.data.models.find((m) => m.id === selected.value?.modelId))
const chart = computed<EChartsOption>(() => ({
  color: ['#087bff', '#9555ff'],
  tooltip: { trigger: 'axis' },
  legend: { data: ['训练损失', '验证损失'], right: 0 },
  grid: { left: 45, right: 20, bottom: 42, top: 40 },
  xAxis: { type: 'category', name: '轮次', data: selected.value?.loss.map((_, i) => i) },
  yAxis: { type: 'value', name: '损失', min: 0 },
  series: [
    { name: '训练损失', type: 'line', data: selected.value?.loss },
    { name: '验证损失', type: 'line', data: selected.value?.validationLoss },
  ],
}))
const dialog = ref(false)
const checkpoint = ref<{ name: string; epoch: number; loss: number }>()
const form = reactive({
  name: '',
  modelId: store.data.models[0]?.id || '',
  baseVersion: '',
  datasetId: store.data.datasets.find((d) => d.purpose === 'training')?.id || '',
  epochs: 10,
  learningRate: 0.0002,
  batchSize: 8,
  targetVersion: '',
})
const baseModel = computed(() => store.data.models.find((m) => m.id === form.modelId))
watch(
  baseModel,
  (m) => {
    form.baseVersion = m?.version || ''
  },
  { immediate: true },
)
async function submit() {
  if (
    ![form.epochs, form.batchSize, form.learningRate].every(
      (n) => typeof n === 'number' && Number.isFinite(n) && n > 0,
    )
  )
    return void ElMessage.warning('请填写有效的训练轮次、批次大小和学习率')
  const ds = store.data.datasets.find((d) => d.id === form.datasetId)
  if (!form.name.trim() || !ds || !baseModel.value || !/^v?\d+\.\d+\.\d+$/.test(form.targetVersion))
    return void ElMessage.warning('请填写任务名称、数据集和有效的目标版本，如 v2.2.0')
  if (
    baseModel.value.versions.some(
      (v) => v.version.replace(/^v/, '') === form.targetVersion.replace(/^v/, ''),
    )
  )
    return void ElMessage.warning('目标版本已存在，请使用新版本号')
  try {
    const task = await store.addTraining({
      ...form,
      name: form.name.trim(),
      datasetVersion: ds.version,
    })
    selectedId.value = task.id
    dialog.value = false
    ElMessage.success('训练任务已登记，等待启动')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '创建失败')
  }
}
</script>
<template>
  <WorkbenchKpis :items="kpis" />
  <div class="mw-training-grid">
    <PanelCard title="训练任务" icon="Tickets"
      ><template #extra
        ><el-button type="primary" :icon="Plus" @click="dialog = true"
          >新建任务</el-button
        ></template
      >
      <el-input
        v-model="keyword"
        placeholder="搜索任务名称、状态"
        clearable
        aria-label="搜索训练任务"
      />
      <div class="mw-task-list">
        <button
          v-for="task in tasks"
          :key="task.id"
          :class="['mw-task', { active: task.id === selectedId }]"
          @click="selectedId = task.id"
        >
          <div class="mw-row">
            <b>{{ task.name }}</b
            ><el-tag>{{ trainingStates[task.status] }}</el-tag>
          </div>
          <p>{{ task.description }}</p>
          <el-progress :percentage="task.progress" /><small
            >更新于 {{ formatModelTime(task.updatedAt) }}</small
          ></button
        ><el-empty v-if="!tasks.length" description="暂无匹配的训练任务" :image-size="70" />
      </div>
    </PanelCard>
    <PanelCard :title="selected?.name || '训练进度'" icon="TrendCharts"
      ><template #extra><el-tag v-if="isMock">训练过程模拟</el-tag></template>
      <template v-if="selected"
        ><div class="mw-info-strip">
          已完成轮次 <b>{{ selected.epoch }} / {{ selected.epochs }}</b
          ><span>已用时 {{ selected.elapsed }}</span>
        </div>
        <el-progress :percentage="selected.progress" /><WorkbenchChart
          v-if="selected.loss.length"
          :option="chart"
          label="训练与验证损失曲线"
        /><el-empty v-else description="任务尚未产生训练日志" />
        <div class="mw-metric-pair">
          <div>
            当前训练损失<strong>{{ selected.loss[selected.loss.length - 1] ?? '暂无' }}</strong>
          </div>
          <div>
            验证损失<strong>{{
              selected.validationLoss[selected.validationLoss.length - 1] ?? '暂无'
            }}</strong>
          </div>
        </div></template
      ><el-empty v-else description="请选择训练任务" />
    </PanelCard>
    <PanelCard title="训练配置" icon="Setting"
      ><el-descriptions v-if="selected" :column="1" border
        ><el-descriptions-item label="基础模型"
          >{{ model?.name }} {{ selected.baseVersion }}</el-descriptions-item
        ><el-descriptions-item label="训练方式">低秩适配微调</el-descriptions-item
        ><el-descriptions-item label="数据集">{{
          dataset?.name || selected.datasetId
        }}</el-descriptions-item
        ><el-descriptions-item label="数据版本">{{ selected.datasetVersion }}</el-descriptions-item
        ><el-descriptions-item label="样本量"
          >{{ dataset?.rowCount.toLocaleString() || '暂无' }} 条</el-descriptions-item
        ><el-descriptions-item label="学习率">{{ selected.learningRate }}</el-descriptions-item
        ><el-descriptions-item label="批次大小">{{ selected.batchSize }}</el-descriptions-item
        ><el-descriptions-item label="训练轮次">{{
          selected.epochs
        }}</el-descriptions-item></el-descriptions
      ></PanelCard
    >
  </div>
  <div v-if="selected" class="mw-grid mw-wide-left">
    <PanelCard title="检查点与训练产物" icon="Coin"
      ><el-table :data="selected.checkpoints" border empty-text="暂无检查点"
        ><el-table-column prop="name" label="检查点" min-width="150" /><el-table-column
          prop="epoch"
          label="轮次"
          width="80"
        /><el-table-column prop="loss" label="验证损失" /><el-table-column label="状态"
          ><template #default>已保存</template></el-table-column
        ><el-table-column label="操作" width="80"
          ><template #default="{ row }"
            ><el-button link type="primary" @click="checkpoint = row">查看</el-button></template
          ></el-table-column
        ></el-table
      >
      <div class="mw-info-strip">
        目标模型版本 <b>{{ selected.targetVersion }}</b
        ><router-link
          v-if="selected.status === 'succeeded'"
          :to="{ path: '/model-train/management', query: { modelId: selected.modelId } }"
          >查看模型产物</router-link
        ><span v-else>完成后登记模型产物</span>
      </div></PanelCard
    >
    <PanelCard title="任务关联" icon="Link"
      ><el-descriptions :column="1" border
        ><el-descriptions-item label="任务编号">{{ selected.id }}</el-descriptions-item
        ><el-descriptions-item label="数据版本">{{ selected.datasetVersion }}</el-descriptions-item
        ><el-descriptions-item label="基础版本">{{
          selected.baseVersion
        }}</el-descriptions-item></el-descriptions
      ><router-link
        class="mw-link"
        :to="{ path: '/compliance/training-monitor', query: { trainingTaskId: selected.id } }"
        >查看训练行为监控 →</router-link
      ></PanelCard
    >
  </div>
  <el-dialog v-model="dialog" title="新建训练任务" width="560px" class="mw-dialog"
    ><el-form label-width="100px" @submit.prevent="submit"
      ><el-form-item label="任务名称" required
        ><el-input v-model="form.name" maxlength="80" /></el-form-item
      ><el-form-item label="基础模型" required
        ><el-select v-model="form.modelId"
          ><el-option
            v-for="m in store.data.models"
            :key="m.id"
            :label="m.name"
            :value="m.id" /></el-select></el-form-item
      ><el-form-item label="基础版本"
        ><el-select v-model="form.baseVersion"
          ><el-option
            v-for="v in baseModel?.versions"
            :key="v.version"
            :value="v.version" /></el-select></el-form-item
      ><el-form-item label="训练数据" required
        ><el-select v-model="form.datasetId"
          ><el-option
            v-for="d in store.data.datasets.filter((d) => d.purpose === 'training')"
            :key="d.id"
            :value="d.id"
            :label="`${d.name} ${d.version}`" /></el-select></el-form-item
      ><el-form-item label="目标版本" required
        ><el-input v-model="form.targetVersion" placeholder="例如 v2.2.0" /></el-form-item
      ><el-form-item label="学习率"
        ><el-input-number
          v-model="form.learningRate"
          :min="0.000001"
          :max="1"
          :step="0.0001"
          :precision="6" /></el-form-item
      ><el-form-item label="批次大小"
        ><el-input-number
          v-model="form.batchSize"
          :min="1"
          :max="256"
          :precision="0" /></el-form-item
      ><el-form-item label="训练轮次"
        ><el-input-number
          v-model="form.epochs"
          :min="1"
          :max="100"
          :precision="0" /></el-form-item></el-form
    ><template #footer
      ><el-button @click="dialog = false">取消</el-button
      ><el-button type="primary" :loading="store.busy" @click="submit"
        >创建任务</el-button
      ></template
    ></el-dialog
  >
  <el-dialog
    :model-value="!!checkpoint"
    title="检查点详情"
    width="440px"
    class="mw-dialog"
    @close="checkpoint = undefined"
    ><el-descriptions v-if="checkpoint" :column="1" border
      ><el-descriptions-item label="名称">{{ checkpoint.name }}</el-descriptions-item
      ><el-descriptions-item label="轮次">{{ checkpoint.epoch }}</el-descriptions-item
      ><el-descriptions-item label="验证损失">{{ checkpoint.loss }}</el-descriptions-item
      ><el-descriptions-item label="关联任务">{{
        selected?.id
      }}</el-descriptions-item></el-descriptions
    ></el-dialog
  >
</template>
